import { initializeKnowledgePlane, synchronizeKnowledge } from './service.js';

await initializeKnowledgePlane();
const sources = process.argv.slice(2);
const result = await synchronizeKnowledge(sources.length ? sources : undefined);
console.log(JSON.stringify(result, null, 2));
if (result.sources.some((source) => source.status === 'error')) process.exitCode = 1;
