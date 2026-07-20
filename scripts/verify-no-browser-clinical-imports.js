import fs from 'node:fs/promises';

const files = [
  'src/App.jsx',
  'src/components/AssistantControlPanel.jsx',
  'src/services/apiClient.js'
];
const forbidden = [
  'HealthcareOrchestrator',
  'VectorStore',
  '/rag/',
  'googleAI.js',
  'openrouter.js',
  'medicalSafety.js',
  'VITE_OPENROUTER_API_KEY',
  'VITE_GOOGLE_AI_API_KEY'
];
const violations = [];
for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  for (const term of forbidden) {
    if (content.includes(term)) violations.push(`${file}: ${term}`);
  }
}
if (violations.length) {
  console.error(`Browser clinical boundary violated:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Browser clinical boundary verified.');
}
