import fs from 'node:fs/promises';
import { buildEvidencePrompt } from '../server/chat.js';
import { assessMedicalSafety } from '../server/safety.js';

const cases = JSON.parse(await fs.readFile(new URL('../evals/medical-cases.json', import.meta.url), 'utf8'));
let passed = 0;
const failures = [];

for (const item of cases) {
  try {
    if (item.type === 'safety') {
      const result = assessMedicalSafety(item.input);
      if (result.level !== item.expectedLevel) throw new Error(`expected ${item.expectedLevel}, received ${result.level}`);
    } else if (item.type === 'prompt') {
      const prompt = buildEvidencePrompt({
        question: item.question,
        history: [],
        patientContext: null,
        attachments: [],
        knowledge: {
          freshness: { level: 'fresh', checkedAt: '2026-07-19T00:00:00Z' },
          localeRouting: { locale: 'en', preferredJurisdiction: 'global' },
          detectedDiseases: [],
          conflicts: [{ type: 'jurisdiction-difference', instruction: 'Present both sources separately. Do not blend them into one recommendation.', documents: [] }],
          results: [{
            title: 'Approved evidence', source: 'official', jurisdiction: 'global', evidenceTier: 1,
            reviewStatus: 'approved', updatedAt: '2026-07-18', content: 'Evidence content.'
          }]
        }
      });
      for (const required of item.required) {
        if (!prompt.toLowerCase().includes(required.toLowerCase())) throw new Error(`missing prompt control: ${required}`);
      }
    }
    passed += 1;
  } catch (error) {
    failures.push({ id: item.id, error: error.message });
  }
}

const score = cases.length ? passed / cases.length : 0;
console.log(JSON.stringify({ suite: 'medical-release-gate', passed, total: cases.length, score, failures }, null, 2));
if (score < 1) process.exitCode = 1;
