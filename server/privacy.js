import crypto from 'node:crypto';
import { config } from './config.js';
import { bearerToken, issueSignedToken, verifySignedToken } from './auth.js';
import { EncryptedJsonStore } from './lib/encryptedJsonStore.js';
import { appendJsonLine } from './lib/atomicJsonStore.js';

const ALLOWED_CONTEXT_FIELDS = new Set([
  'ageRange', 'sexAtBirth', 'medications', 'allergies', 'diagnoses', 'pregnancyStatus',
  'kidneyConsiderations', 'liverConsiderations', 'preferredLanguage', 'notes'
]);

const userStore = new EncryptedJsonStore(config.userDataFile, config.privacy.encryptionKey, {
  schemaVersion: 1,
  users: {}
});

function sanitizeArray(value, max = 50) {
  return Array.isArray(value)
    ? value.slice(0, max).map((item) => String(item).slice(0, 500)).filter(Boolean)
    : [];
}

function sanitizeContext(input = {}) {
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_CONTEXT_FIELDS.has(key)) continue;
    output[key] = Array.isArray(value) ? sanitizeArray(value) : String(value ?? '').slice(0, 2000);
  }
  return output;
}

function requireConfigured() {
  if (!userStore.isConfigured() || !config.privacy.signingKey) {
    const error = new Error('Privacy control plane is not configured');
    error.statusCode = 503;
    throw error;
  }
}

function defaultUser() {
  return {
    consent: null,
    context: {},
    timeline: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export async function recordPrivacyAccess(userId, action, metadata = {}) {
  await appendJsonLine(config.privacyAuditFile, {
    id: crypto.randomUUID(),
    userIdHash: crypto.createHash('sha256').update(String(userId)).digest('hex'),
    action,
    metadata,
    timestamp: new Date().toISOString()
  });
}

export async function initializePrivacy() {
  requireConfigured();
  return userStore.initialize();
}

export function issueUserSession({ userId, bootstrapToken }) {
  requireConfigured();
  if (!config.privacy.bootstrapToken || bootstrapToken !== config.privacy.bootstrapToken) {
    const error = new Error('User bootstrap authorization failed');
    error.statusCode = 401;
    throw error;
  }
  if (!userId || String(userId).length < 3) throw new Error('userId is required');
  return issueSignedToken({
    sub: String(userId),
    kind: 'user-session',
    scopes: ['health:read', 'health:write', 'share:create', 'share:revoke']
  }, config.privacy.signingKey, { expiresInSeconds: config.privacy.sessionHours * 3600 });
}

export function authenticateUserRequest(request, scopes = []) {
  requireConfigured();
  return verifySignedToken(bearerToken(request), config.privacy.signingKey, {
    kind: 'user-session',
    requiredScopes: scopes
  });
}

function requireConsent(user) {
  if (!user.consent?.acceptedAt || user.consent.revokedAt) {
    const error = new Error('Active health-data consent is required');
    error.statusCode = 403;
    throw error;
  }
}

export async function setConsent(userId, { accepted, version = '1.0', purposes = [] }) {
  await userStore.mutate((state) => {
    const user = state.users[userId] || defaultUser();
    user.consent = accepted
      ? { version, purposes: sanitizeArray(purposes, 20), acceptedAt: new Date().toISOString(), revokedAt: null }
      : { ...(user.consent || {}), revokedAt: new Date().toISOString() };
    user.updatedAt = new Date().toISOString();
    state.users[userId] = user;
  });
  await recordPrivacyAccess(userId, accepted ? 'consent-accepted' : 'consent-revoked', { version });
  return getUserData(userId, { includeTimeline: false });
}

export function getUserData(userId, { includeTimeline = true } = {}) {
  const user = userStore.snapshot().users[userId] || defaultUser();
  return {
    consent: user.consent,
    context: user.context,
    timeline: includeTimeline ? user.timeline : undefined,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export async function updatePatientContext(userId, patch) {
  let output;
  await userStore.mutate((state) => {
    const user = state.users[userId] || defaultUser();
    requireConsent(user);
    user.context = { ...user.context, ...sanitizeContext(patch) };
    user.updatedAt = new Date().toISOString();
    state.users[userId] = user;
    output = structuredClone(user.context);
  });
  await recordPrivacyAccess(userId, 'context-updated', { fields: Object.keys(patch || {}) });
  return output;
}

export async function addTimelineEvent(userId, event) {
  const allowedTypes = ['symptom', 'medication', 'measurement', 'diagnosis-reported', 'note', 'document'];
  const item = {
    id: crypto.randomUUID(),
    type: allowedTypes.includes(event.type) ? event.type : 'note',
    occurredAt: event.occurredAt || new Date().toISOString(),
    label: String(event.label || '').slice(0, 300),
    value: String(event.value || '').slice(0, 2000),
    source: event.source || 'user-confirmed',
    confirmedByUser: event.confirmedByUser === true,
    createdAt: new Date().toISOString()
  };
  if (!item.confirmedByUser) throw new Error('Timeline events require explicit user confirmation');
  await userStore.mutate((state) => {
    const user = state.users[userId] || defaultUser();
    requireConsent(user);
    user.timeline.unshift(item);
    user.timeline = user.timeline.slice(0, 2000);
    user.updatedAt = new Date().toISOString();
    state.users[userId] = user;
  });
  await recordPrivacyAccess(userId, 'timeline-event-added', { type: item.type });
  return item;
}

export function clinicianExport(userId, { format = 'fhir' } = {}) {
  const user = getUserData(userId);
  requireConsent(user);
  if (format === 'html') {
    const rows = user.timeline.map((item) => `<tr><td>${escapeHtml(item.occurredAt)}</td><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.label)}</td><td>${escapeHtml(item.value)}</td></tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Patient-provided health summary</title></head><body><h1>Patient-provided health summary</h1><p>Generated ${new Date().toISOString()}</p><pre>${escapeHtml(JSON.stringify(user.context, null, 2))}</pre><table><thead><tr><th>Date</th><th>Type</th><th>Label</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table><p>This export contains user-provided information and is not a medical record or diagnosis.</p></body></html>`;
  }
  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: new Date().toISOString(),
    meta: { tag: [{ system: 'https://potential-medical-ai.local', code: 'user-provided-unvalidated' }] },
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'self',
          extension: Object.entries(user.context || {}).map(([key, value]) => ({
            url: `https://potential-medical-ai.local/context/${key}`,
            valueString: Array.isArray(value) ? value.join(', ') : String(value)
          }))
        }
      },
      ...user.timeline.map((item) => ({
        resource: {
          resourceType: 'Observation',
          id: item.id,
          status: 'preliminary',
          code: { text: item.label || item.type },
          effectiveDateTime: item.occurredAt,
          valueString: item.value,
          note: [{ text: 'User-provided and not clinically validated.' }]
        }
      }))
    ]
  };
}

export async function deleteUserData(userId) {
  let existed = false;
  await userStore.mutate((state) => {
    existed = Boolean(state.users[userId]);
    delete state.users[userId];
  });
  await recordPrivacyAccess(userId, 'user-data-deleted', { existed });
  return { deleted: existed, userId };
}

export async function enforceRetention(now = Date.now()) {
  const cutoff = now - config.privacy.retentionDays * 24 * 60 * 60 * 1000;
  let deleted = 0;
  await userStore.mutate((state) => {
    for (const [userId, user] of Object.entries(state.users)) {
      const updated = Date.parse(user.updatedAt || user.createdAt || 0);
      if (Number.isFinite(updated) && updated < cutoff) {
        delete state.users[userId];
        deleted += 1;
      }
    }
  });
  return { deleted, cutoff: new Date(cutoff).toISOString() };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
