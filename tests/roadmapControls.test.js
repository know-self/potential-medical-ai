import assert from 'node:assert/strict';
import test from 'node:test';
import { issueSignedToken, verifySignedToken } from '../server/auth.js';
import { explainLabResults, medicalImageBoundary } from '../server/labs.js';
import { resolveEvidenceConflicts } from '../knowledge-plane/conflicts.js';
import { classifyModelTask } from '../server/modelRouter.js';

const secret = 'this-is-a-test-signing-secret-with-length';

test('signed sessions enforce kind and scopes', () => {
  const token = issueSignedToken({ sub: 'user-1', kind: 'user-session', scopes: ['health:read'] }, secret);
  const payload = verifySignedToken(token, secret, { kind: 'user-session', requiredScopes: ['health:read'] });
  assert.equal(payload.sub, 'user-1');
  assert.throws(() => verifySignedToken(token, secret, { requiredScopes: ['health:write'] }), /Missing required scope/);
});

test('lab explanation only compares supplied numeric ranges', () => {
  const result = explainLabResults({ results: [{ name: 'X', value: 12, referenceLow: 2, referenceHigh: 10, unit: 'mg/L' }] });
  assert.equal(result.results[0].flag, 'high');
  assert.match(result.disclaimer, /not a diagnosis/i);
});

test('medical image boundary rejects diagnostic interpretation', () => {
  const result = medicalImageBoundary({ locale: 'en' });
  assert.equal(result.allowed, false);
  assert.match(result.message, /does not diagnose/i);
});

test('evidence conflict resolver surfaces jurisdiction differences', () => {
  const conflicts = resolveEvidenceConflicts([
    { id: 'a', title: 'A', source: 'who', jurisdiction: 'global', evidenceTier: 1, reviewStatus: 'approved', diseaseIds: ['x'], category: 'guideline', content: 'recommended' },
    { id: 'b', title: 'B', source: 'local', jurisdiction: 'Vietnam', evidenceTier: 1, reviewStatus: 'approved', diseaseIds: ['x'], category: 'guideline', content: 'recommended' }
  ]);
  assert.equal(conflicts[0].type, 'jurisdiction-difference');
});

test('model routing marks dose and organ impairment questions as high sensitivity', () => {
  const task = classifyModelTask({ question: 'Can I change the dose with kidney impairment?', knowledge: {}, attachments: [] });
  assert.equal(task.highSensitivity, true);
  assert.equal(task.type, 'high-sensitivity-medical');
});
