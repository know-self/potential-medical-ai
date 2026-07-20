import crypto from 'node:crypto';

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decode(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function signature(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export function issueSignedToken(payload, secret, { expiresInSeconds = 3600 } = {}) {
  if (!secret || String(secret).length < 24) throw new Error('Signing secret must contain at least 24 characters');
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'PMAT' });
  const body = encode({ ...payload, iat: now, exp: now + expiresInSeconds, jti: crypto.randomUUID() });
  const unsigned = `${header}.${body}`;
  return `${unsigned}.${signature(unsigned, secret)}`;
}

export function verifySignedToken(token, secret, { requiredScopes = [], kind } = {}) {
  if (!secret || !token) throw new Error('Authentication token is required');
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Invalid authentication token');
  const unsigned = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(unsigned, secret));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw new Error('Invalid authentication token');
  const payload = decode(parts[1]);
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) throw new Error('Authentication token expired');
  if (kind && payload.kind !== kind) throw new Error('Authentication token has the wrong kind');
  const scopes = new Set(Array.isArray(payload.scopes) ? payload.scopes : []);
  for (const scope of requiredScopes) {
    if (!scopes.has(scope)) throw new Error(`Missing required scope: ${scope}`);
  }
  return payload;
}

export function bearerToken(request) {
  const header = String(request.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export function safeSecretEqual(actual = '', expected = '') {
  if (!actual || !expected) return false;
  const left = Buffer.from(String(actual));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
