import { normalizeModelSettings, streamCustomModelChunks } from './models.js';
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

export function planRetrieval({ question = '', attachments = [] } = {}) {
  const text = String(question).trim().toLowerCase();
  const greeting = /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening)|xin ch[aà]o|cảm ơn)[.!?\s]*$/iu.test(text);
  const evidenceSensitive = /\b(?:evidence|source|citation|cite|guideline|recommend(?:ation)?|medication|medicine|drug|treatment|diagnos(?:is|e)|dos(?:e|age)|clinical|study|research|bằng chứng|nguồn|trích dẫn|hướng dẫn|khuyến nghị|thuốc|điều trị|chẩn đoán|liều)\b/iu.test(text);
  const highSensitivity = classifyModelTask({ question, attachments }).highSensitivity;
  return {
    documentsUsed: attachments.length > 0,
    knowledgeUsed: !greeting && (highSensitivity || evidenceSensitive),
    knowledgeFallback: false,
    classification: greeting ? 'simple-conversation' : highSensitivity ? 'high-sensitivity-medical' : evidenceSensitive ? 'evidence-sensitive' : 'general-conversation'
  };
}

export function providerOrder(task, modelSettings = {}) {
  try {
    const normalized = normalizeModelSettings(modelSettings);
    const provider = `custom:${normalized.endpointHost}`;
    return isCircuitOpen(provider) ? [] : [provider];
  } catch {
    return [];
  }
}

export async function generateRoutedResponse({ messages, prompt, question, knowledge = {}, attachments = [], modelSettings, cacheable = true, onChunk }) {
  const task = classifyModelTask({ question, knowledge, attachments });
  const normalized = normalizeModelSettings(modelSettings);
  const provider = `custom:${normalized.endpointHost}`;
  if (isCircuitOpen(provider)) throw new Error(`Custom model circuit is temporarily open for ${normalized.endpointHost}`);

  const key = cacheKey({
    prompt: JSON.stringify(messages || [{ role: 'user', content: prompt }]),
    knowledgeUpdatedAt: knowledge.knowledgeUpdatedAt || '',
    task: `${task.type}:${normalized.endpointHost}:${normalized.model}`
  });
  const cached = cacheable ? getCachedResponse(key) : null;
  if (cached) {
    onChunk?.(cached.text);
    return { ...cached, cached: true, task };
  }

  try {
    const result = await streamCustomModelChunks({
      settings: normalized,
      messages: messages || [{ role: 'user', content: String(prompt || '') }],
      temperature: task.highSensitivity ? Math.min(normalized.temperature, 0.2) : normalized.temperature,
      maxTokens: normalized.maxTokens
    }, onChunk);
    recordProviderSuccess(provider);
    const output = {
      text: result.text,
      provider: 'custom-openai-compatible',
      endpointHost: result.endpointHost,
      model: result.model,
      cached: false,
      task
    };
    if (cacheable) setCachedResponse(key, output);
    return output;
  } catch (error) {
    recordProviderFailure(provider);
    throw error;
  }
}
