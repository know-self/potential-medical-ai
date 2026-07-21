import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bearerToken } from './auth.js';
import { initializeUserAuth, loginUser, registerUser } from './userAuth.js';
import { capacityStatus } from './capacity.js';
import { streamMedicalChat } from './chat.js';
import { config } from './config.js';
import { knowledgePlane } from './knowledgeClient.js';
import { explainLabResults, medicalImageBoundary } from './labs.js';
import {
  addTimelineEvent,
  authenticateUserRequest,
  clinicianExport,
  deleteUserData,
  enforceRetention,
  getUserData,
  initializePrivacy,
  issueUserSession,
  recordPrivacyAccess,
  setConsent,
  updatePatientContext
} from './privacy.js';
import {
  createClinicianShare,
  initializeSharing,
  listUserShares,
  pruneExpiredShares,
  readClinicianShare,
  revokeClinicianShare
} from './sharing.js';
import {
  deleteUpload,
  initializeUploads,
  listUploads,
  pruneExpiredUploads,
  readUpload,
  storeUpload
} from './uploads.js';

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const staticRoot = path.join(serverDirectory, '..', 'dist');
const rateBuckets = new Map();
const capabilityState = {
  privacy: { configured: false, error: null },
  sharing: { configured: false, error: null },
  uploads: { configured: false, error: null },
  auth: { configured: false, error: null }
};

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
  let relativePath = decodeURIComponent(pathname === '/' ? '/index.html' : pathname).replace(/^\/+/, '');
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
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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

async function readJson(request, maxBytes = 15_000_000) {
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

function authenticatedUser(request, scopes = [], { optional = false } = {}) {
  if (optional && !bearerToken(request)) return null;
  return authenticateUserRequest(request, scopes);
}

function shareAccessMetadata(request) {
  return { ip: clientIp(request), userAgent: request.headers['user-agent'] || '' };
}

async function initializeOptionalCapabilities() {
  for (const [name, initializer] of Object.entries({
    privacy: initializePrivacy,
    sharing: initializeSharing,
    uploads: initializeUploads,
    auth: initializeUserAuth
  })) {
    try {
      await initializer();
      capabilityState[name] = { configured: true, error: null };
    } catch (error) {
      capabilityState[name] = { configured: false, error: error.message };
    }
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
          product: 'conversational-medical-assistant',
          status: usable ? 'ok' : 'degraded',
          knowledge,
          models: {
            openRouterConfigured: Boolean(config.openRouter.apiKey),
            googleConfigured: Boolean(config.google.apiKey),
            configured: Boolean(config.model.endpoint && config.model.model)
          },
          capabilities: capabilityState,
          capacity: capacityStatus(),
          localClinicalProcessing: false,
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/register') {
        json(response, 201, await registerUser(await readJson(request)));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        json(response, 200, await loginUser(await readJson(request)));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/status') {
        json(response, 200, await knowledgePlane.publicStatus());
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
          maxEvidenceTier: url.searchParams.get('maxEvidenceTier') || 4,
          locale: url.searchParams.get('locale') || 'auto'
        }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/terminology') {
        json(response, 200, await knowledgePlane.terminology(url.searchParams.get('q') || '', {
          locale: url.searchParams.get('locale') || 'auto',
          limit: Number(url.searchParams.get('limit')) || 10
        }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/knowledge/diseases') {
        json(response, 200, await knowledgePlane.diseases());
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/privacy/session') {
        const body = await readJson(request);
        const token = issueUserSession({ userId: body.userId, bootstrapToken: bearerToken(request) });
        json(response, 201, { token, expiresInHours: config.privacy.sessionHours });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/privacy/me') {
        const user = authenticatedUser(request, ['health:read']);
        await recordPrivacyAccess(user.sub, 'profile-read');
        json(response, 200, getUserData(user.sub));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/privacy/consent') {
        const user = authenticatedUser(request, ['health:write']);
        json(response, 200, await setConsent(user.sub, await readJson(request)));
        return;
      }

      if (request.method === 'PATCH' && url.pathname === '/api/privacy/context') {
        const user = authenticatedUser(request, ['health:write']);
        json(response, 200, { context: await updatePatientContext(user.sub, await readJson(request)) });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/privacy/timeline') {
        const user = authenticatedUser(request, ['health:read']);
        await recordPrivacyAccess(user.sub, 'timeline-read');
        json(response, 200, { timeline: getUserData(user.sub).timeline });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/privacy/timeline') {
        const user = authenticatedUser(request, ['health:write']);
        json(response, 201, await addTimelineEvent(user.sub, await readJson(request)));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/privacy/export') {
        const user = authenticatedUser(request, ['health:read']);
        const format = url.searchParams.get('format') === 'html' ? 'html' : 'fhir';
        const exported = clinicianExport(user.sub, { format });
        await recordPrivacyAccess(user.sub, 'clinician-export', { format });
        if (format === 'html') {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="patient-summary.html"' });
          response.end(exported);
        } else json(response, 200, exported);
        return;
      }

      if (request.method === 'DELETE' && url.pathname === '/api/privacy/me') {
        const user = authenticatedUser(request, ['health:write']);
        json(response, 200, await deleteUserData(user.sub));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/shares') {
        const user = authenticatedUser(request, ['share:create']);
        const body = await readJson(request);
        const userData = getUserData(user.sub);
        if (!userData.consent?.acceptedAt || userData.consent.revokedAt) {
          const error = new Error('Active consent is required before clinician sharing');
          error.statusCode = 403;
          throw error;
        }
        json(response, 201, await createClinicianShare(user.sub, {
          ...body,
          context: userData.context,
          consentSnapshot: userData.consent
        }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/shares') {
        const user = authenticatedUser(request, ['health:read']);
        json(response, 200, { shares: listUserShares(user.sub) });
        return;
      }

      const publicShareMatch = request.method === 'GET' && url.pathname.match(/^\/api\/shares\/public\/([^/]+)$/);
      if (publicShareMatch) {
        json(response, 200, await readClinicianShare(decodeURIComponent(publicShareMatch[1]), shareAccessMetadata(request)));
        return;
      }

      const revokeShareMatch = request.method === 'DELETE' && url.pathname.match(/^\/api\/shares\/([^/]+)$/);
      if (revokeShareMatch) {
        const user = authenticatedUser(request, ['share:revoke']);
        json(response, 200, await revokeClinicianShare(user.sub, decodeURIComponent(revokeShareMatch[1])));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/uploads') {
        const user = authenticatedUser(request, ['health:write']);
        json(response, 201, await storeUpload(user.sub, await readJson(request, config.uploads.maxBytes * 1.5 + 100_000)));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/uploads') {
        const user = authenticatedUser(request, ['health:read']);
        json(response, 200, { uploads: listUploads(user.sub) });
        return;
      }

      const uploadMatch = url.pathname.match(/^\/api\/uploads\/([^/]+)$/);
      if (request.method === 'GET' && uploadMatch) {
        const user = authenticatedUser(request, ['health:read']);
        json(response, 200, await readUpload(user.sub, decodeURIComponent(uploadMatch[1])));
        return;
      }
      if (request.method === 'DELETE' && uploadMatch) {
        const user = authenticatedUser(request, ['health:write']);
        json(response, 200, await deleteUpload(user.sub, decodeURIComponent(uploadMatch[1])));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/labs/explain') {
        json(response, 200, explainLabResults(await readJson(request)));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/images/boundary') {
        json(response, 200, medicalImageBoundary(await readJson(request)));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/chat/stream') {
        const body = await readJson(request);
        const user = authenticatedUser(request, ['health:read'], { optional: true });
        let patientContext = null;
        let attachments = [];
        if (user) {
          patientContext = getUserData(user.sub).context;
          const attachmentIds = Array.isArray(body.attachmentIds) ? body.attachmentIds.slice(0, 8) : [];
          attachments = await Promise.all(attachmentIds.map((id) => readUpload(user.sub, id)));
        }
        await streamMedicalChat(body, response, {
          tenantId: user?.sub || clientIp(request),
          patientContext,
          attachments
        });
        return;
      }

      if (!url.pathname.startsWith('/api/') && await serveStatic(url.pathname, response)) return;
      json(response, 404, { error: url.pathname.startsWith('/api/') ? 'API route not found' : 'Frontend build not found. Run npm run build.' });
    } catch (error) {
      console.error(error);
      if (!response.headersSent) json(response, error.statusCode || (/too large/i.test(error.message) ? 413 : 500), { error: error.message });
      else response.end();
    }
  });
}

export async function startMedicalServer() {
  await initializeOptionalCapabilities();
  const server = createMedicalServer();
  await new Promise((resolve) => server.listen(config.port, config.host, resolve));
  console.log(`Medical chat gateway listening on http://${config.host}:${config.port}`);

  const retentionTimer = setInterval(() => {
    Promise.allSettled([
      capabilityState.privacy.configured ? enforceRetention() : null,
      capabilityState.sharing.configured ? pruneExpiredShares() : null,
      capabilityState.uploads.configured ? pruneExpiredUploads() : null
    ]).catch(() => {});
  }, 24 * 60 * 60 * 1000);
  retentionTimer.unref();

  const shutdown = () => {
    clearInterval(retentionTimer);
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
