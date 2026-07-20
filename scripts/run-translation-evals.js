import fs from 'node:fs/promises';
import { resolveTerminology } from '../knowledge-plane/terminology.js';

const cases = JSON.parse(await fs.readFile(new URL('../evals/translation-cases.json', import.meta.url), 'utf8'));
let passed = 0;
const failures = [];

for (const item of cases) {
  try {
    const result = resolveTerminology(item.input, { locale: 'auto', limit: 20 });
    if (result.locale !== item.locale) throw new Error(`expected locale ${item.locale}, received ${result.locale}`);
    if (item.expectedDisease && !result.matches.some((match) => match.id === item.expectedDisease)) {
      throw new Error(`missing disease mapping ${item.expectedDisease}`);
    }
    if (item.expectedDose && !result.protectedTokens.doses.some((dose) => dose.toLowerCase() === item.expectedDose.toLowerCase())) {
      throw new Error(`missing preserved dose ${item.expectedDose}`);
    }
    if (item.expectedUnit && !result.protectedTokens.units.some((unit) => unit.toLowerCase() === item.expectedUnit.toLowerCase())) {
      throw new Error(`missing preserved unit ${item.expectedUnit}`);
    }
    passed += 1;
  } catch (error) {
    failures.push({ id: item.id, error: error.message });
  }
}

const score = cases.length ? passed / cases.length : 0;
console.log(JSON.stringify({ suite: 'translation-release-gate', passed, total: cases.length, score, failures }, null, 2));
if (score < 1) process.exitCode = 1;
