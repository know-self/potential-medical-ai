import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config.js';
import {
  clinicalGovernance,
  getDisease,
  getKnowledgeStatus,
  initializeKnowledgePlane,
  listDiseases,
  observability,
  resolveSnomedTerm,
  resolveTerminology,
  searchKnowledge,
  sourceRegistry,
  synchronizeKnowledge
} from './service.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const reviewConsolePath = path.join(root, '..', 'admin', 'review-console.html');

function json(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
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
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

function safeTokenEqual(actual = '', expected = '') {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function bearer(request) {
  const header = String(request.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function isAdmin(request) {
  return safeTokenEqual(bearer(request), config.apiAdminToken);
}

function isReviewer(request) {
  const token = bearer(request);
  return safeTokenEqual(token, config.reviewerToken) || safeTokenEqual(token, config.apiAdminToken);
}

function requireRole(request, role) {
  const allowed = role === 'reviewer' ? isReviewer(request) : isAdmin(request);
  if (!allowed) {
    const error = new Error(`${role === 'reviewer' ? 'Reviewer' : 'Administrator'} token required`);
    error.statusCode = 401;
    throw error;
  }
}

function hostnameAllowed(request) {
  const hostHeader = String(request.headers.host || '');
  const hostname = hostHeader.replace(/^\[/, '').replace(/\].*$/, '').split(':')[0];
  return config.knowledgeAllowedHosts.includes('*') || config.knowledgeAllowedHosts.includes(hostname);
}

export function createKnowledgePlaneServer() {
  return http.createServer(async (request, response) => {
    if (!hostnameAllowed(request)) {
      json(response, 421, { error: 'Host not allowed' });
      return;
    }
    const hostHeader = String(request.headers.host || 'localhost');
    const url = new URL(request.url || '/', `http://${hostHeader}`);

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

      if (request.method === 'GET' && url.pathname === '/public/status') {
        const status = getKnowledgeStatus();
        json(response, 200, {
          service: 'medical-knowledge-plane',
          freshness: status.freshness,
          updatedAt: status.updatedAt,
          incidents: observability.incidents({ publicOnly: true }).filter((item) => item.status !== 'resolved').slice(0, 20)
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/search') {
        const result = searchKnowledge(url.searchParams.get('q') || '', {
          limit: url.searchParams.get('limit') || 8,
          sources: url.searchParams.getAll('source'),
          maxEvidenceTier: url.searchParams.get('maxEvidenceTier') || 4,
          includeClinicalReview: url.searchParams.get('includeClinicalReview') === 'true',
          locale: url.searchParams.get('locale') || 'auto'
        });
        json(response, 200, result);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/terminology') {
        json(response, 200, resolveTerminology(url.searchParams.get('q') || '', {
          locale: url.searchParams.get('locale') || 'auto',
          limit: Number(url.searchParams.get('limit')) || 10
        }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/terminology/snomed') {
        json(response, 200, await resolveSnomedTerm(url.searchParams.get('q') || '', {
          limit: Number(url.searchParams.get('limit')) || 10
        }));
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

      if (request.method === 'GET' && url.pathname === '/metrics') {
        requireRole(request, 'admin');
        response.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
        response.end(observability.prometheus());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/admin/review-console') {
        const html = await fs.readFile(reviewConsolePath);
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(html);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/admin/reviews') {
        requireRole(request, 'reviewer');
        const items = clinicalGovernance.queue();
        json(response, 200, { items, count: items.length });
        return;
      }

      const reviewMatch = url.pathname.match(/^\/admin\/reviews\/([^/]+)$/);
      if (request.method === 'GET' && reviewMatch) {
        requireRole(request, 'reviewer');
        const result = clinicalGovernance.review(decodeURIComponent(reviewMatch[1]));
        json(response, result ? 200 : 404, result || { error: 'Review item not found' });
        return;
      }

      const decisionMatch = url.pathname.match(/^\/admin\/reviews\/([^/]+)\/decision$/);
      if (request.method === 'POST' && decisionMatch) {
        requireRole(request, 'reviewer');
        const body = await readJson(request);
        json(response, 200, await clinicalGovernance.decide(decodeURIComponent(decisionMatch[1]), body));
        return;
      }

      const rollbackMatch = url.pathname.match(/^\/admin\/reviews\/([^/]+)\/rollback$/);
      if (request.method === 'POST' && rollbackMatch) {
        requireRole(request, 'reviewer');
        const body = await readJson(request);
        json(response, 200, await clinicalGovernance.rollback(decodeURIComponent(rollbackMatch[1]), body));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/admin/audit') {
        requireRole(request, 'reviewer');
        json(response, 200, { entries: await clinicalGovernance.audit({ limit: Number(url.searchParams.get('limit')) || 200 }) });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/admin/sources') {
        requireRole(request, 'admin');
        json(response, 200, sourceRegistry.list());
        return;
      }

      const sourceMatch = url.pathname.match(/^\/admin\/sources\/([^/]+)$/);
      if (request.method === 'PATCH' && sourceMatch) {
        requireRole(request, 'admin');
        const body = await readJson(request);
        json(response, 200, await sourceRegistry.update(decodeURIComponent(sourceMatch[1]), body, body.actor || 'admin'));
        return;
      }

      const sourceApprovalMatch = url.pathname.match(/^\/admin\/sources\/([^/]+)\/approve$/);
      if (request.method === 'POST' && sourceApprovalMatch) {
        requireRole(request, 'reviewer');
        const body = await readJson(request);
        json(response, 200, await sourceRegistry.approve(decodeURIComponent(sourceApprovalMatch[1]), body));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/admin/incidents') {
        requireRole(request, 'admin');
        json(response, 200, { incidents: observability.incidents() });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/admin/incidents') {
        requireRole(request, 'admin');
        json(response, 201, await observability.createIncident(await readJson(request)));
        return;
      }

      const incidentMatch = url.pathname.match(/^\/admin\/incidents\/([^/]+)$/);
      if (request.method === 'PATCH' && incidentMatch) {
        requireRole(request, 'admin');
        const body = await readJson(request);
        json(response, 200, await observability.updateIncident(decodeURIComponent(incidentMatch[1]), body, body.actor || 'admin'));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/sync') {
        requireRole(request, 'admin');
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
