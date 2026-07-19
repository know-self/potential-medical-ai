import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidencePrompt } from '../server/chat.js';

test('chat prompt carries freshness, evidence status, and citations', () => {
  const prompt = buildEvidencePrompt({
    question: 'How should chronic kidney disease affect diabetes treatment?',
    history: [{ role: 'user', content: 'I have diabetes.' }],
    knowledge: {
      freshness: { level: 'fresh', checkedAt: '2026-07-19T00:00:00Z' },
      localeRouting: { locale: 'en', preferredJurisdiction: 'global' },
      detectedDiseases: [{ name: 'Chronic kidney disease', nameVi: 'Bệnh thận mạn' }],
      conflicts: [],
      results: [{
        title: 'Example guideline', source: 'official-guideline', jurisdiction: 'global', evidenceTier: 1,
        reviewStatus: 'approved', updatedAt: '2026-07-18', content: 'Treatment decisions depend on kidney function.'
      }]
    }
  });

  assert.match(prompt, /Knowledge freshness: fresh/);
  assert.match(prompt, /evidence tier: 1/);
  assert.match(prompt, /review: approved/);
  assert.match(prompt, /\[1\] Example guideline/);
  assert.match(prompt, /Use only the evidence below/);
});
