import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessMedicalSafety,
  buildSafetyResponse,
  detectLocale
} from '../server/safety.js';

test('detects English emergency symptoms', () => {
  const result = assessMedicalSafety('I have crushing chest pain and cannot breathe');
  assert.equal(result.level, 'emergency');
  assert.deepEqual(result.matchedSignals.map(({ id }) => id).sort(), ['breathing', 'chest-pain']);
});

test('detects Vietnamese emergency symptoms', () => {
  const result = assessMedicalSafety('Tôi bị đau ngực và khó thở');
  assert.equal(result.level, 'emergency');
  assert.equal(detectLocale('Tôi bị đau ngực'), 'vi');
});

test('prioritizes crisis language', () => {
  const result = assessMedicalSafety('I want to kill myself tonight');
  assert.equal(result.level, 'crisis');
  assert.match(buildSafetyResponse(result, 'en'), /immediate human support/i);
});

test('does not escalate negated symptoms', () => {
  assert.equal(assessMedicalSafety('I do not have chest pain').level, 'normal');
});

test('does not escalate a general informational question', () => {
  assert.equal(assessMedicalSafety('What is chest pain?').level, 'normal');
});

test('returns a Vietnamese emergency response', () => {
  const input = 'Tôi không thở được';
  const response = buildSafetyResponse(assessMedicalSafety(input), detectLocale(input));
  assert.match(response, /tình trạng cấp cứu/i);
  assert.match(response, /không trì hoãn/i);
});
