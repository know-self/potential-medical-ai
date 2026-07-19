import crypto from 'node:crypto';
import http from 'node:http';
import { config } from '../server/config.js';
import {
  getDisease,
  getKnowledgeStatus,
  initializeKnowledgePlane,
  listDiseases,
  searchKnowledge,
  synchronizeKnowledge
} from './service.js';

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

async function readJson(request, maxBytes = 250_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function safeTokenEqual(actual = '', expected = '') {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isAdmin(request) {
  const header = String(request.headers.authorization || '');
  return safeTokenEqual(header.startsWith('Bearer ') ? header.slice(7) : '', config.apiAdminToken);
}

export function createKnowledgePlaneServer() {
  return http.createServer(async (request, response) => {
    const hostHeader = String(request.headers.host || '');
    const hostname = hostHeader.replace(/^\[/, '').replace(/\].*$/, '').split(':')[0];
    if (!config.knowledgeAllowedHosts.includes('*') && !config.knowledgeAllowedHosts.includes(hostname)) {
      json(response, 421, { error: 'Host not allowed' });
      return;
    }
    const url = new URL(request.url || '/', `http://${hostHeader || 'localhost'}`);

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        const status = getKnowledgeStatus();
        json(response, status.freshness.usable ? 200 : 503, { service: 'medical-knowledge-plane', ...status });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/status') {
        json(response, 200, getKnowledgeStatus());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/search') {
        const result = searchKnowledge(url.searchParams.get('q') || '', {
          limit: url.searchParams.get('limit') || 8,
          sources: url.searchParams.getAll('source'),
          maxEvidenceTier: url.searchParams.get('maxEvidenceTier') || 4,
          includeClinicalReview: url.searchParams.get('includeClinicalReview') === 'true'
        });
        json(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/diseases') {
        const diseases = listDiseases();
        json(response, 200, { diseases, count: diseases.length });
        return;
      }

      const diseaseMatch = request.method === 'GET' && url.pathname.match(/^\/diseases\/([^/]+)$/);
      if (diseaseMatch) {
        const disease = getDisease(decodeURIComponent(diseaseMatch[1]));
        json(response, disease ? 200 : 404, disease || { error: 'Disease not found' });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/sync') {
        if (!config.apiAdminToken || !isAdmin(request)) {
          json(response, 401, { error: 'Administrator token required' });
          return;
        }
        if (!config.syncEnabled) {
          json(response, 409, { error: 'Knowledge synchronization is disabled' });
          return;
        }
        const body = await readJson(request);
        const result = await synchronizeKnowledge(Array.isArray(body.sources) ? body.sources : undefined);
        json(response, 200, { ...result, status: getKnowledgeStatus() });
        return;
      }

      json(response, 404, { error: 'Knowledge plane route not found' });
    } catch (error) {
      const status = error.statusCode || (/too large/i.test(error.message) ? 413 : 500);
      json(response, status, { error: error.message, code: error.code || null, freshness: error.freshness || null });
    }
  });
}

export async function startKnowledgePlane() {
  await initializeKnowledgePlane();
  const server = createKnowledgePlaneServer();
  await new Promise((resolve) => server.listen(config.knowledgePlanePort, config.knowledgePlaneHost, resolve));
  console.log(`Knowledge plane listening on http://${config.knowledgePlaneHost}:${config.knowledgePlanePort}`);

  if (config.syncEnabled && config.syncOnStart) {
    synchronizeKnowledge().catch((error) => console.error('Initial knowledge sync failed:', error));
  }

  let timer = null;
  if (config.syncEnabled && config.syncIntervalMinutes > 0) {
    timer = setInterval(() => {
      synchronizeKnowledge().catch((error) => console.error('Scheduled knowledge sync failed:', error));
    }, config.syncIntervalMinutes * 60_000);
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
  startKnowledgePlane().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
