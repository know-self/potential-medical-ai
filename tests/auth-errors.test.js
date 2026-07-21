import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AuthenticationError,
  issueSignedToken,
  verifySignedToken
} from '../server/auth.js';

const secret = 'test-signing-secret-with-at-least-32-characters';
const payload = {
  sub: 'test-user',
  kind: 'user-session',
  scopes: ['health:read']
};

function capture(fn) {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw');
}

test('invalid tokens are structured 401 errors without stack spam', () => {
  const error = capture(() => verifySignedToken('not-a-token', secret, { kind: 'user-session' }));
  assert.ok(error instanceof AuthenticationError);
  assert.equal(error.statusCode, 401);
  assert.equal(error.code, 'AUTH_TOKEN_INVALID');
  assert.equal(error.stack, undefined);
});

test('expired tokens have a stable machine-readable code', () => {
  const token = issueSignedToken(payload, secret, { expiresInSeconds: -1 });
  const error = capture(() => verifySignedToken(token, secret, { kind: 'user-session' }));
  assert.equal(error.statusCode, 401);
  assert.equal(error.code, 'AUTH_TOKEN_EXPIRED');
});

test('missing scopes are authorization failures rather than server errors', () => {
  const token = issueSignedToken(payload, secret);
  const error = capture(() => verifySignedToken(token, secret, {
    kind: 'user-session',
    requiredScopes: ['health:write']
  }));
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, 'AUTH_SCOPE_MISSING');
});

test('valid user sessions continue to verify normally', () => {
  const token = issueSignedToken(payload, secret);
  const verified = verifySignedToken(token, secret, {
    kind: 'user-session',
    requiredScopes: ['health:read']
  });
  assert.equal(verified.sub, payload.sub);
  assert.equal(verified.kind, payload.kind);
});
