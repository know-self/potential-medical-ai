import crypto from 'node:crypto';
import { config } from './config.js';
import { issueSignedToken } from './auth.js';
import { EncryptedJsonStore } from './lib/encryptedJsonStore.js';

const accountStore = new EncryptedJsonStore(config.userAuthFile, config.privacy.encryptionKey, {
  schemaVersion: 1,
  accounts: {}
});

function authFailure(message, code = 'AUTH_CREDENTIALS_INVALID', statusCode = 401) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw authFailure('Enter a valid email address', 'AUTH_EMAIL_INVALID', 400);
  }
  return email;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 12 || password.length > 1024) {
    throw authFailure('Password must contain 12 to 1024 characters', 'AUTH_PASSWORD_INVALID', 400);
  }
  return password;
}

function passwordHash(password, salt = crypto.randomBytes(16).toString('base64')) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, derived) => {
      if (error) reject(error);
      else resolve({ salt, hash: derived.toString('base64') });
    });
  });
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'base64');
  const b = Buffer.from(String(right || ''), 'base64');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function issueSession(account) {
  return issueSignedToken({
    sub: account.id,
    email: account.email,
    kind: 'user-session',
    scopes: ['health:read', 'health:write', 'share:create', 'share:revoke']
  }, config.privacy.signingKey, { expiresInSeconds: config.privacy.sessionHours * 3600 });
}

function requireConfigured() {
  if (!accountStore.isConfigured() || !config.privacy.signingKey) {
    const error = new Error('User authentication is not configured');
    error.statusCode = 503;
    throw error;
  }
}

export async function initializeUserAuth() {
  requireConfigured();
  return accountStore.initialize();
}

export async function registerUser({ email, password } = {}) {
  requireConfigured();
  const normalizedEmail = normalizeEmail(email);
  const validPassword = validatePassword(password);
  const credentials = await passwordHash(validPassword);
  let account;
  await accountStore.mutate((state) => {
    if (state.accounts[normalizedEmail]) throw authFailure('An account already exists for this email', 'AUTH_EMAIL_TAKEN', 409);
    account = { id: crypto.randomUUID(), email: normalizedEmail, password: credentials, createdAt: new Date().toISOString() };
    state.accounts[normalizedEmail] = account;
  });
  return { token: issueSession(account), user: { id: account.id, email: account.email }, expiresInHours: config.privacy.sessionHours };
}

export async function loginUser({ email, password } = {}) {
  requireConfigured();
  const normalizedEmail = normalizeEmail(email);
  const validPassword = validatePassword(password);
  const account = accountStore.snapshot().accounts[normalizedEmail];
  const credentials = account?.password ? await passwordHash(validPassword, account.password.salt) : await passwordHash(validPassword, 'invalid-account-salt');
  if (!account || !safeEqual(credentials.hash, account.password.hash)) throw authFailure('Email or password is incorrect');
  return { token: issueSession(account), user: { id: account.id, email: account.email }, expiresInHours: config.privacy.sessionHours };
}
