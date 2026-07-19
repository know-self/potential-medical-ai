import crypto from 'node:crypto';
import { config } from './config.js';
import { hashToken } from './auth.js';
import { EncryptedJsonStore } from './lib/encryptedJsonStore.js';

const shareStore = new EncryptedJsonStore(config.shareDataFile, config.privacy.encryptionKey, {
  schemaVersion: 1,
  shares: []
});

function redactText(value) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[redacted-phone]')
    .replace(/\b\d{9,12}\b/g, '[redacted-identifier]')
    .replace(/\b(?:address|địa chỉ)\s*:\s*[^\n]+/gi, '[redacted-address]');
}

function sanitizeTranscript(transcript, redact = true) {
  if (!Array.isArray(transcript)) throw new Error('transcript must be an array');
  return transcript.slice(-200).map((item) => ({
    role: ['user', 'assistant', 'system'].includes(item.role) ? item.role : 'user',
    content: redact ? redactText(item.content) : String(item.content || '').slice(0, 30000),
    timestamp: item.timestamp || item.createdAt || null
  }));
}

export async function initializeSharing() {
  if (!shareStore.isConfigured()) throw new Error('Secure sharing is not configured');
  return shareStore.initialize();
}

export async function createClinicianShare(userId, input = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const requested = Number(input.expiresInMinutes) || config.sharing.defaultExpiryMinutes;
  const expiresInMinutes = Math.min(Math.max(requested, 5), config.sharing.maxExpiryMinutes);
  const share = {
    id: crypto.randomUUID(),
    ownerUserId: userId,
    tokenHash: hashToken(token),
    label: String(input.label || 'Clinician review').slice(0, 200),
    transcript: sanitizeTranscript(input.transcript || [], input.redact !== false),
    context: input.includeContext ? structuredClone(input.context || {}) : null,
    consentSnapshot: structuredClone(input.consentSnapshot || null),
    scope: ['transcript:read'],
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + expiresInMinutes * 60_000).toISOString(),
    revokedAt: null,
    accessLog: []
  };

  await shareStore.mutate((state) => {
    state.shares.unshift(share);
    state.shares = state.shares.slice(0, 5000);
  });

  return {
    id: share.id,
    token,
    expiresAt: share.expiresAt,
    label: share.label,
    redacted: input.redact !== false
  };
}

export async function readClinicianShare(token, access = {}) {
  const tokenHash = hashToken(token);
  let output = null;
  await shareStore.mutate((state) => {
    const share = state.shares.find((item) => item.tokenHash === tokenHash);
    if (!share) throw new Error('Share not found');
    if (share.revokedAt) throw new Error('Share has been revoked');
    if (Date.parse(share.expiresAt) <= Date.now()) throw new Error('Share has expired');
    share.accessLog.unshift({
      accessedAt: new Date().toISOString(),
      ipHash: access.ip ? hashToken(access.ip).slice(0, 16) : null,
      userAgent: String(access.userAgent || '').slice(0, 300)
    });
    share.accessLog = share.accessLog.slice(0, 200);
    output = {
      id: share.id,
      label: share.label,
      transcript: structuredClone(share.transcript),
      context: structuredClone(share.context),
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      disclaimer: 'Patient-shared information for review; not a verified clinical record.'
    };
  });
  return output;
}

export async function revokeClinicianShare(userId, shareId) {
  let revoked = false;
  await shareStore.mutate((state) => {
    const share = state.shares.find((item) => item.id === shareId && item.ownerUserId === userId);
    if (!share) throw new Error('Share not found');
    if (!share.revokedAt) share.revokedAt = new Date().toISOString();
    revoked = true;
  });
  return { revoked, shareId };
}

export function listUserShares(userId) {
  return shareStore.snapshot().shares
    .filter((item) => item.ownerUserId === userId)
    .map(({ tokenHash, transcript, context, ...item }) => ({
      ...item,
      messageCount: transcript.length,
      includesContext: Boolean(context)
    }));
}

export async function pruneExpiredShares(now = Date.now()) {
  let removed = 0;
  await shareStore.mutate((state) => {
    const before = state.shares.length;
    state.shares = state.shares.filter((item) => Date.parse(item.expiresAt) > now && !item.revokedAt);
    removed = before - state.shares.length;
  });
  return { removed };
}

export { redactText };
