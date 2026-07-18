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

export async function streamOpenRouter({ messages, temperature, maxTokens }, response) {
  if (!config.openRouter.apiKey) {
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'OPENROUTER_API_KEY is not configured on the server' }));
    return;
  }

  const upstream = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
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
      stream: true
    })
  }, Math.max(config.requestTimeoutMs, 90000));

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    response.writeHead(upstream.status || 502, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: text.slice(0, 1000) || 'OpenRouter request failed' }));
    return;
  }

  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.write(value);
    }
  } finally {
    response.end();
  }
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
