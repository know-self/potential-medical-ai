import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { streamMedicalChat } from './chat.js';
import { config } from './config.js';
import { knowledgePlane } from './knowledgeClient.js';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(serverDirectory, '..', 'dist');
const rateBuckets = new Map();

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
  const relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
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

function rateLimit(request) {
  const now = Date.now();
  const key = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
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
        let knowledge;
        try {
          knowledge = await knowledgePlane.health();
        } catch (error) {
          knowledge = { service: 'medical-knowledge-plane', status: 'unavailable', error: error.message };
        }
        const usable = knowledge.freshness?.usable !== false && knowledge.status !== 'unavailable';
        json(response, usable ? 200 : 503, {
          service: 'medical-chat-gateway',
          status: usable ? 'ok' : 'degraded',
          knowledge,
          models: {
            openRouterConfigured: Boolean(config.openRouter.apiKey),
            googleConfigured: Boolean(config.google.apiKey)
          },
          localClinicalProcessing: false,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/status') {
        json(response, 200, await knowledgePlane.status());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/search') {
        json(response, 200, await knowledgePlane.search(url.searchParams.get('q') || '', {
          limit: url.searchParams.get('limit') || 8,
          sources: url.searchParams.getAll('source'),
          maxEvidenceTier: url.searchParams.get('maxEvidenceTier') || 4
        }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/diseases') {
        json(response, 200, await knowledgePlane.diseases());
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/chat/stream') {
        const body = await readJson(request);
        await streamMedicalChat(body, response);
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
  const server = createMedicalServer();
  await new Promise((resolve) => server.listen(config.port, config.host, resolve));
  console.log(`Medical chat gateway listening on http://${config.host}:${config.port}`);

  const shutdown = () => {
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
