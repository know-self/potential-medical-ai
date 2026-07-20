import { config } from './config.js';
import { runConnectors } from './connectors/index.js';
import { KnowledgeStore } from './knowledge/store.js';

export async function synchronizeKnowledge({ sources } = {}) {
  const store = new KnowledgeStore({ knowledgeFile: config.knowledgeFile, sourceStateFile: config.sourceStateFile });
  await store.initialize();
  return runConnectors({ store, sources });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sources = process.argv.slice(2).filter(Boolean);
  synchronizeKnowledge({ sources }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.sources.some((item) => item.status === 'error') ? 1 : 0;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
