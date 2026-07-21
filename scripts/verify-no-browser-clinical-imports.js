import fs from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = path.resolve('src');
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

async function sourceFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(target));
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) output.push(target);
  }
  return output;
}

const files = await sourceFiles(sourceRoot);
if (!files.length) throw new Error('No browser source files were found under src/');

const violations = [];
for (const file of files) {
  const content = await fs.readFile(file, 'utf8');
  const relative = path.relative(process.cwd(), file).replaceAll(path.sep, '/');
  for (const term of forbidden) {
    if (content.includes(term)) violations.push(`${relative}: ${term}`);
  }
}

if (violations.length) {
  console.error(`Browser clinical boundary violated:\n${violations.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Browser clinical boundary verified across ${files.length} source files.`);
}
