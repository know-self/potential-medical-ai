import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const forbidden = [
  'HealthcareOrchestrator',
  'OpenRouterService',
  'GoogleAIService',
  'RAGStep',
  'KnowledgeBase',
  'AnalyticsStep',
  'medicalSafety'
];

const found = forbidden.filter((name) => source.includes(name));
if (found.length) {
  console.error(`Browser clinical imports detected: ${found.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('No browser-side clinical orchestration imports detected.');
}
