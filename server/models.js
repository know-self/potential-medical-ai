import { config } from './config.js';
import { fetchJson, fetchWithTimeout } from './lib/http.js';

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages must be a non-empty array');
  return messages.slice(-24).map((message) => ({
    role: ['system', 'assistant', 'user'].includes(message.role) ? message.role : 'user',
    content: String(message.content || '').slice(0, 30000)
  }));
}

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, min), max) : fallback;
}

async function openRouterResponse({ messages, temperature, maxTokens, stream }) {
  if (!config.openRouter.apiKey) throw new Error('OPENROUTER_API_KEY is not configured on the server');
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openRouter.apiKey}`,
      'HTTP-Referer': config.openRouter.appUrl,
      'X-Title': config.openRouter.appName
    },
    body: JSON.stringify({
      model: config.openRouter.model,
      messages: validateMessages(messages),
      temperature: clamp(temperature, 0, 1, 0.2),
      max_tokens: clamp(maxTokens, 256, 16000, 5000),
      stream
    })
  }, Math.max(config.requestTimeoutMs, 90000));

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${text.slice(0, 1000) || 'request failed'}`);
  }
  return response;
}

export async function streamOpenRouterChunks(payload, onChunk) {
  const response = await openRouterResponse({ ...payload, stream: true });
  if (!response.body) throw new Error('OpenRouter returned no response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const chunk = parsed.choices?.[0]?.delta?.content || '';
        if (chunk) {
          fullText += chunk;
          onChunk?.(chunk);
        }
      } catch {
        // Ignore malformed provider events while preserving the stream.
      }
    }
    if (done) break;
  }

  return fullText;
}

export async function generateGoogle({ prompt, temperature, maxTokens }) {
  if (!config.google.apiKey) throw new Error('GOOGLE_AI_API_KEY is not configured on the server');
  const model = encodeURIComponent(config.google.model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(config.google.apiKey)}`;
  const payload = await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: String(prompt || '').slice(0, 120000) }] }],
      generationConfig: {
        temperature: clamp(temperature, 0, 1, 0.2),
        maxOutputTokens: clamp(maxTokens, 256, 16000, 5000)
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' }
      ]
    })
  }, Math.max(config.requestTimeoutMs, 90000));

  const text = (payload.candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('');
  if (!text) throw new Error(payload.promptFeedback?.blockReason || 'Google model returned no text');
  return { text, model: config.google.model };
}
