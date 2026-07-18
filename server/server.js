import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { runConnectors } from './connectors/index.js';
import { KnowledgeStore } from './knowledge/store.js';
import { generateGoogle, streamOpenRouter } from './models.js';
import { assessMedicalSafety, buildSafetyResponse, detectLocale } from './safety.js';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(serverDirectory, '..', 'dist');

const store = new KnowledgeStore({ knowledgeFile: config.knowledgeFile, sourceStateFile: config.sourceStateFile });
const rateBuckets = new Map();
let syncInFlight = null;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

async function serveStatic(pathname, response) {
  let relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  relativePath = relativePath.replace(/^\/+/, '');
  const resolvedRoot = path.resolve(staticRoot);
  let filePath = path.resolve(resolvedRoot, relativePath);
  if (filePath !== resolvedRoot && !filePath.startsWith(`${resolvedRoot}${path.sep}`)) return false;

  try {
    const body = await fs.readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.basename(filePath) === 'index.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    response.end(body);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
  }

  if (!path.extname(relativePath)) {
    filePath = path.join(staticRoot, 'index.html');
    try {
      const body = await fs.readFile(filePath);
      response.writeHead(200, { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-cache' });
      response.end(body);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  return false;
}

function json(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  response.end(JSON.stringify(payload));
}

function getOrigin(request) {
  return request.headers.origin || '';
}

function corsHeaders(request) {
  const origin = getOrigin(request);
  const allowed = config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : 'null',
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400'
  };
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimit(request) {
  const now = Date.now();
  const key = clientIp(request);
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + config.rateLimitWindowMs });
    return { allowed: true, remaining: config.rateLimitMax - 1 };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= config.rateLimitMax, remaining: Math.max(0, config.rateLimitMax - bucket.count), resetAt: bucket.resetAt };
}

async function readJson(request, maxBytes = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Invalid JSON body');
  }
}

function safeEqualToken(actual = '', expected = '') {
  if (!expected || !actual) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAdmin(request) {
  const header = String(request.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return safeEqualToken(token, config.apiAdminToken);
}

async function synchronize(sources) {
  if (syncInFlight) return syncInFlight;
  syncInFlight = runConnectors({ store, sources }).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

export function createMedicalServer() {
  return http.createServer(async (request, response) => {
    const cors = corsHeaders(request);
    for (const [key, value] of Object.entries(cors)) response.setHeader(key, value);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (cors['Access-Control-Allow-Origin'] === 'null' && getOrigin(request)) {
      json(response, 403, { error: 'Origin not allowed' });
      return;
    }

    const limit = rateLimit(request);
    response.setHeader('X-RateLimit-Limit', String(config.rateLimitMax));
    response.setHeader('X-RateLimit-Remaining', String(limit.remaining));
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(Math.ceil((limit.resetAt - Date.now()) / 1000)));
      json(response, 429, { error: 'Rate limit exceeded' });
      return;
    }

    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    try {
      if (request.method === 'GET' && url.pathname === '/api/health') {
        json(response, 200, {
          status: 'ok',
          knowledge: store.getStatus(),
          models: {
            openRouterConfigured: Boolean(config.openRouter.apiKey),
            googleConfigured: Boolean(config.google.apiKey)
          },
          syncEnabled: config.syncEnabled,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/status') {
        json(response, 200, store.getStatus());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/search') {
        const sources = url.searchParams.getAll('source');
        const result = store.search(url.searchParams.get('q') || '', {
          limit: url.searchParams.get('limit') || 8,
          sources,
          maxEvidenceTier: url.searchParams.get('maxEvidenceTier') || 4
        });
        json(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/diseases') {
        json(response, 200, { diseases: store.listDiseases(), count: store.listDiseases().length });
        return;
      }

      const diseaseMatch = request.method === 'GET' && url.pathname.match(/^\/api\/knowledge\/diseases\/([^/]+)$/);
      if (diseaseMatch) {
        const disease = store.getDisease(decodeURIComponent(diseaseMatch[1]));
        json(response, disease ? 200 : 404, disease || { error: 'Disease not found' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/safety/assess') {
        const body = await readJson(request);
        const assessment = assessMedicalSafety(body.text || body.message || '');
        const locale = body.locale || detectLocale(body.text || body.message || '');
        json(response, 200, {
          ...assessment,
          locale,
          response: assessment.level === 'normal' ? null : buildSafetyResponse(assessment, locale)
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/models/openrouter/stream') {
        const body = await readJson(request);
        await streamOpenRouter(body, response);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/models/google/generate') {
        const body = await readJson(request);
        const result = await generateGoogle(body);
        json(response, 200, result);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/knowledge/sync') {
        if (!config.apiAdminToken || !isAdmin(request)) {
          json(response, 401, { error: 'Administrator token required' });
          return;
        }
        if (!config.syncEnabled) {
          json(response, 409, { error: 'Knowledge synchronization is disabled' });
          return;
        }
        const body = await readJson(request);
        const sources = Array.isArray(body.sources) ? body.sources : undefined;
        const result = await synchronize(sources);
        json(response, 200, result);
        return;
      }

      if (!url.pathname.startsWith('/api/') && await serveStatic(url.pathname, response)) return;
      json(response, 404, { error: url.pathname.startsWith('/api/') ? 'API route not found' : 'Frontend build not found. Run npm run build.' });
    } catch (error) {
      console.error(error);
      if (!response.headersSent) json(response, /too large/i.test(error.message) ? 413 : 500, { error: error.message });
      else response.end();
    }
  });
}

export async function startMedicalServer() {
  await store.initialize();
  const server = createMedicalServer();
  await new Promise((resolve) => server.listen(config.port, config.host, resolve));
  console.log(`Medical API listening on http://${config.host}:${config.port}`);

  if (config.syncEnabled && config.syncOnStart) {
    synchronize().catch((error) => console.error('Initial knowledge sync failed:', error));
  }

  let timer = null;
  if (config.syncEnabled && config.syncIntervalMinutes > 0) {
    timer = setInterval(() => synchronize().catch((error) => console.error('Scheduled knowledge sync failed:', error)), config.syncIntervalMinutes * 60_000);
    timer.unref();
  }

  const shutdown = () => {
    if (timer) clearInterval(timer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMedicalServer().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
