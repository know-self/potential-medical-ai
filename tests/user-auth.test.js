import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pmai-user-auth-'));
const { config } = await import('../server/config.js');
config.userAuthFile = path.join(directory, 'accounts.enc.json');
config.privacy.encryptionKey = 'test-encryption-key-with-at-least-32-characters';
config.privacy.signingKey = 'test-signing-key-with-at-least-32-characters';
config.privacy.sessionHours = 1;
const { initializeUserAuth, loginUser, registerUser } = await import('../server/userAuth.js');
const { verifySignedToken } = await import('../server/auth.js');

test.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });

test('email/password registration creates a scoped secure session', async () => {
  await initializeUserAuth();
  const result = await registerUser({ email: 'Patient@Example.com', password: 'a-long-enough-password' });
  assert.equal(result.user.email, 'patient@example.com');
  const session = verifySignedToken(result.token, config.privacy.signingKey, { kind: 'user-session', requiredScopes: ['health:write'] });
  assert.equal(session.email, 'patient@example.com');
  await assert.rejects(() => registerUser({ email: 'patient@example.com', password: 'a-long-enough-password' }), { code: 'AUTH_EMAIL_TAKEN' });
});

test('email/password login rejects incorrect credentials without issuing a session', async () => {
  const result = await loginUser({ email: 'patient@example.com', password: 'a-long-enough-password' });
  assert.ok(result.token);
  await assert.rejects(() => loginUser({ email: 'patient@example.com', password: 'incorrect-password-value' }), { code: 'AUTH_CREDENTIALS_INVALID' });
});
