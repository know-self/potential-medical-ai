import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from './config.js';
import { fetchWithTimeout } from './lib/http.js';

const BLOCKED_HEADERS = new Set([
  'authorization', 'connection', 'content-length', 'cookie', 'host', 'origin',
  'proxy-authorization', 'referer', 'te', 'trailer', 'transfer-encoding', 'upgrade'
]);

function clamp(value, min, max, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(Math.max(numeric, min), max) : fallback;
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages must be a non-empty array');
  return messages.slice(-32).map((message) => ({
    role: ['system', 'assistant', 'user'].includes(message.role) ? message.role : 'user',
    content: String(message.content || '').slice(0, config.customModel.maxMessageCharacters)
  }));
}

function normalizeHeaders(value = {}) {
  const output = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  for (const [name, rawValue] of Object.entries(value).slice(0, 20)) {
    const normalized = String(name || '').trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(normalized) || BLOCKED_HEADERS.has(normalized)) continue;
    output[normalized] = String(rawValue ?? '').slice(0, 2000);
  }
  return output;
}

function endpointUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('Custom model endpoint must be a valid URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Custom model endpoint must use http or https');
  if (url.username || url.password) throw new Error('Credentials must not be embedded in the endpoint URL');
  url.hash = '';
  url.search = '';
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname || pathname === '/') url.pathname = '/v1/chat/completions';
  else if (pathname.endsWith('/v1')) url.pathname = `${pathname}/chat/completions`;
  else url.pathname = pathname;
  return url;
}

function isLoopback(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(hostname).toLowerCase());
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0);
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('2001:db8');
  }
  return true;
}

async function validateEndpointNetwork(url) {
  const hostname = url.hostname.toLowerCase();
  if (['169.254.169.254', 'metadata.google.internal', 'metadata.google'].includes(hostname)) {
    throw new Error('Custom model endpoint targets a blocked metadata service');
  }
  if (config.customModel.allowedHosts.length && !config.customModel.allowedHosts.includes(hostname)) {
    throw new Error(`Custom model host is not allowed: ${hostname}`);
  }
  if (url.protocol === 'http:' && !isLoopback(hostname) && !config.customModel.allowPrivateNetwork) {
    throw new Error('Remote custom model endpoints must use HTTPS; HTTP is allowed only for loopback models');
  }
  if (isLoopback(hostname)) return;
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('Custom model endpoint hostname did not resolve');
  if (!config.customModel.allowPrivateNetwork && addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error('Custom model endpoint resolves to a private or reserved network');
  }
}

export function normalizeModelSettings(input = {}) {
  const url = endpointUrl(input.endpoint);
  const model = String(input.model || '').trim().slice(0, 300);
  if (!model) throw new Error('Custom model name is required');
  const mode = ['direct', 'document-rag', 'knowledge-rag'].includes(input.mode) ? input.mode : 'direct';
  return {
    endpoint: url.toString(),
    endpointHost: url.host,
    model,
    apiKey: String(input.apiKey || '').trim().slice(0, 12000),
    mode,
    temperature: clamp(input.temperature, 0, 2, 0.2),
    maxTokens: Math.round(clamp(input.maxTokens, 64, config.customModel.maxOutputTokens, 4096)),
    systemPrompt: String(input.systemPrompt || '').slice(0, 12000),
    includePatientContext: input.includePatientContext === true,
    headers: normalizeHeaders(input.headers)
  };
}

function extractContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((item) => typeof item === 'string' ? item : item?.text || '').join('');
  return '';
}

async function parseStreamingResponse(response, onChunk) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Custom model returned no response body');
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const chunk = extractContent(parsed.choices?.[0]?.delta?.content || parsed.choices?.[0]?.message?.content);
        if (chunk) {
          fullText += chunk;
          onChunk?.(chunk);
        }
      } catch {
        // Ignore malformed provider events while preserving valid streamed chunks.
      }
    }
    if (done) break;
  }
  return fullText;
}

export async function streamCustomModelChunks({ settings, messages, temperature, maxTokens }, onChunk) {
  const normalized = settings?.endpointHost ? settings : normalizeModelSettings(settings);
  const url = new URL(normalized.endpoint);
  await validateEndpointNetwork(url);
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream, application/json',
      ...(normalized.apiKey ? { Authorization: `Bearer ${normalized.apiKey}` } : {}),
      ...normalized.headers
    },
    body: JSON.stringify({
      model: normalized.model,
      messages: validateMessages(messages),
      temperature: clamp(temperature ?? normalized.temperature, 0, 2, normalized.temperature),
      max_tokens: Math.round(clamp(maxTokens ?? normalized.maxTokens, 64, config.customModel.maxOutputTokens, normalized.maxTokens)),
      stream: true
    })
  }, Math.max(config.requestTimeoutMs, 120000));

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Custom model ${response.status}: ${text.slice(0, 1200) || 'request failed'}`);
    error.statusCode = response.status >= 400 && response.status < 500 ? 400 : 502;
    throw error;
  }

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  let text = '';
  if (contentType.includes('text/event-stream')) text = await parseStreamingResponse(response, onChunk);
  else {
    const payload = await response.json();
    text = extractContent(payload.choices?.[0]?.message?.content || payload.output_text || payload.response);
    if (text) onChunk?.(text);
  }
  if (!text) throw new Error('Custom model returned no text');
  return { text, model: normalized.model, endpointHost: normalized.endpointHost };
}
