import { config } from './config.js';
import { generateGoogle, streamOpenRouterChunks } from './models.js';
import {
  cacheKey,
  getCachedResponse,
  isCircuitOpen,
  recordProviderFailure,
  recordProviderSuccess,
  setCachedResponse
} from './capacity.js';

export function classifyModelTask({ question = '', knowledge = {}, attachments = [] }) {
  const text = String(question).toLowerCase();
  const highSensitivity = /\b(?:dose|dosage|pregnan|contraindicat|kidney|renal|liver|hepatic|liều|thai|chống chỉ định|suy thận|suy gan)\b/i.test(text);
  const documentHeavy = attachments.length > 0 || String(question).length > 3000;
  const conflictSensitive = Array.isArray(knowledge.conflicts) && knowledge.conflicts.length > 0;
  return {
    type: documentHeavy ? 'document-analysis' : conflictSensitive ? 'evidence-conflict' : highSensitivity ? 'high-sensitivity-medical' : 'general-medical',
    highSensitivity,
    documentHeavy,
    conflictSensitive
  };
}

export function providerOrder(task) {
  const available = [];
  if (task.documentHeavy && config.google.apiKey) available.push('google');
  if (config.openRouter.apiKey) available.push('openrouter');
  if (config.google.apiKey && !available.includes('google')) available.push('google');
  return available.filter((provider) => !isCircuitOpen(provider));
}

export async function generateRoutedResponse({ prompt, question, knowledge, attachments = [], onChunk }) {
  const task = classifyModelTask({ question, knowledge, attachments });
  const providers = providerOrder(task);
  if (!providers.length) throw new Error('No grounded model provider is available');

  const key = cacheKey({ prompt, knowledgeUpdatedAt: knowledge.knowledgeUpdatedAt, task: task.type });
  const cached = getCachedResponse(key);
  if (cached) {
    onChunk?.(cached.text);
    return { ...cached, cached: true, task };
  }

  const errors = [];
  for (const provider of providers) {
    try {
      let text;
      let model;
      if (provider === 'openrouter') {
        text = await streamOpenRouterChunks({
          messages: [{ role: 'user', content: prompt }],
          temperature: task.highSensitivity ? 0.05 : 0.15,
          maxTokens: task.documentHeavy ? 7000 : 5000
        }, onChunk);
        model = config.openRouter.model;
      } else {
        const result = await generateGoogle({
          prompt,
          temperature: task.highSensitivity ? 0.05 : 0.15,
          maxTokens: task.documentHeavy ? 7000 : 5000
        });
        text = result.text;
        model = result.model;
        onChunk?.(text);
      }
      recordProviderSuccess(provider);
      const output = { text, provider, model, cached: false, task };
      setCachedResponse(key, output);
      return output;
    } catch (error) {
      recordProviderFailure(provider);
      errors.push(`${provider}: ${error.message}`);
    }
  }

  throw new Error(`All grounded model providers failed: ${errors.join('; ')}`);
}
