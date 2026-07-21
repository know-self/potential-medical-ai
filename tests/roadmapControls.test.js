import assert from 'node:assert/strict';
import test from 'node:test';
import { issueSignedToken, verifySignedToken } from '../server/auth.js';
import { explainLabResults, medicalImageBoundary } from '../server/labs.js';
import { resolveEvidenceConflicts } from '../knowledge-plane/conflicts.js';
import { classifyModelTask, planRetrieval } from '../server/modelRouter.js';
import { buildModelMessages } from '../server/chat.js';

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

test('automatic retrieval combines documents and governed knowledge when appropriate', () => {
  assert.deepEqual(planRetrieval({ question: 'What guideline evidence supports this dosage?', attachments: [{ id: 'doc-1' }] }), {
    documentsUsed: true,
    knowledgeUsed: true,
    knowledgeFallback: false,
    classification: 'high-sensitivity-medical'
  });
  assert.equal(planRetrieval({ question: 'Hello!' }).knowledgeUsed, false);
});

test('legacy direct mode cannot discard validated document evidence', () => {
  const messages = buildModelMessages({
    question: 'Summarize it', history: [], knowledge: {}, patientContext: null,
    settings: { mode: 'direct', includePatientContext: false, systemPrompt: '' },
    attachments: [{ id: 'doc-1', filename: 'notes.txt', extraction: { status: 'complete', confidence: 0.98, text: 'Document evidence' } }]
  });
  const prompt = messages.map((message) => message.content).join('\n');
  assert.match(prompt, /UPLOADED DOCUMENTS/);
  assert.match(prompt, /\[D1\] notes\.txt/);
  assert.match(prompt, /Use \[D1\], \[D2\]/);
});
