import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assessMedicalSafety,
  buildSafetyResponse,
  detectLocale
} from '../src/services/safety/medicalSafety.js';

test('detects English emergency symptoms', () => {
  const result = assessMedicalSafety('I have crushing chest pain and cannot breathe');

  assert.equal(result.level, 'emergency');
  assert.deepEqual(
    result.matchedSignals.map(({ id }) => id).sort(),
    ['breathing', 'chest-pain']
  );
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
  const result = assessMedicalSafety('I do not have chest pain');

  assert.equal(result.level, 'normal');
});

test('does not escalate a general informational question', () => {
  const result = assessMedicalSafety('What is chest pain?');

  assert.equal(result.level, 'normal');
});

test('returns a Vietnamese emergency response', () => {
  const assessment = assessMedicalSafety('Tôi không thở được');
  const response = buildSafetyResponse(assessment, detectLocale('Tôi không thở được'));

  assert.match(response, /tình trạng cấp cứu/i);
  assert.match(response, /không trì hoãn/i);
});
