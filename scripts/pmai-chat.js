import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const MIME_TYPES = {
  '.txt': 'text/plain', '.md': 'text/plain', '.json': 'application/json', '.pdf': 'application/pdf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
};
const palette = {
  cyan: '\u001b[36m', green: '\u001b[32m', yellow: '\u001b[33m', red: '\u001b[31m',
  blue: '\u001b[34m', bold: '\u001b[1m', dim: '\u001b[2m', reset: '\u001b[0m'
};

function paint(value, tone, enabled = true) {
  return enabled ? `${palette[tone] || ''}${value}${palette.reset}` : String(value);
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function authHeaders(token, extra = {}) {
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export class GatewayHttpError extends Error {
  constructor(message, { status = 0, code = null, payload = null } = {}) {
    super(message);
    this.name = 'GatewayHttpError';
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

async function gatewayError(response) {
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { /* keep raw text */ }
  return new GatewayHttpError(payload?.error || payload?.message || text || `HTTP ${response.status}`, {
    status: response.status,
    code: payload?.code || null,
    payload
  });
}

export function isGatewayAuthenticationError(error) {
  return error?.status === 401 || /^AUTH_TOKEN_/.test(String(error?.code || ''));
}

export function parseSseBuffer(buffer = '') {
  const blocks = String(buffer).split(/\r?\n\r?\n/);
  const rest = blocks.pop() || '';
  const events = [];
  for (const block of blocks) {
    const data = block.split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) continue;
    try { events.push(JSON.parse(data)); }
    catch { events.push({ type: 'malformed', raw: data }); }
  }
  return { events, rest };
}

export async function streamGatewayChat({
  gatewayUrl,
  message,
  history = [],
  token = '',
  locale = 'auto',
  attachmentIds = [],
  modelSettings = {},
  signal,
  onChunk
}) {
  const response = await fetch(`${normalizeBaseUrl(gatewayUrl)}/api/chat/stream`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      history: history.slice(-40).map(({ role, content }) => ({ role, content })),
      locale,
      attachmentIds: attachmentIds.slice(0, 8),
      model: modelSettings
    }),
    signal
  });
  if (!response.ok || !response.body) throw await gatewayError(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let metadata = null;
  let streamError = null;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      if (event.type === 'chunk' && event.text) {
        text += event.text;
        onChunk?.(event.text);
      } else if (event.type === 'done') metadata = event;
      else if (event.type === 'error') streamError = event.error || 'Medical chat stream failed';
    }
    if (done) break;
  }
  if (streamError && !text) throw new GatewayHttpError(streamError, { code: metadata?.code || null });
  return { text, metadata, error: streamError };
}

export function parseSlashCommand(line = '') {
  const trimmed = String(line).trim();
  if (!trimmed.startsWith('/')) return null;
  const match = trimmed.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  return { name: (match?.[1] || '').toLowerCase(), value: (match?.[2] || '').trim() };
}

function inferMime(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function apiJson(gatewayUrl, pathname, { token = '', method = 'GET', body, signal } = {}) {
  const response = await fetch(`${normalizeBaseUrl(gatewayUrl)}${pathname}`, {
    method,
    headers: authHeaders(token, body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal
  });
  if (!response.ok) throw await gatewayError(response);
  return response.status === 204 ? null : response.json();
}

async function uploadAttachment(gatewayUrl, token, filePath) {
  if (!token) throw new Error('A user session token is required. Use /token <value> first.');
  const absolute = path.resolve(filePath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error('Attachment path is not a file');
  if (stat.size > 10 * 1024 * 1024) throw new Error('Attachment exceeds the default 10 MB limit');
  const content = await fs.readFile(absolute);
  return apiJson(gatewayUrl, '/api/uploads', {
    token,
    method: 'POST',
    body: {
      filename: path.basename(absolute),
      mimeType: inferMime(absolute),
      contentBase64: content.toString('base64')
    }
  });
}

function printInteractiveHelp(colorEnabled) {
  const c = (value, tone) => paint(value, tone, colorEnabled);
  console.log(`${c('Terminal commands', 'bold')}
  ${c('/help', 'cyan')}                 Show commands
  ${c('/new', 'cyan')}                  Start a fresh in-memory conversation
  ${c('/status', 'cyan')}               Show gateway, model mode, and knowledge status
  ${c('/model', 'cyan')}                Show custom endpoint host, model, and mode
  ${c('/mode <mode>', 'cyan')}          direct, document-rag, or knowledge-rag
  ${c('/history', 'cyan')}              Print the current conversation
  ${c('/attach <path>', 'cyan')}        Upload and attach a document or image
  ${c('/attachments', 'cyan')}          List selected attachments
  ${c('/detach <id|all>', 'cyan')}      Remove selected attachments
  ${c('/token <value|clear>', 'cyan')}  Set a private session token in memory
  ${c('/context', 'cyan')}              Read consented patient context
  ${c('/save [path]', 'cyan')}          Explicitly save transcript and attachment IDs
  ${c('/load <path>', 'cyan')}          Load a previously saved session
  ${c('/clear', 'cyan')}                Clear the terminal screen
  ${c('/exit', 'cyan')}                 Quit

The model API key and session token are never written by /save.`);
}

async function printStatus(gatewayUrl, modelSettings, colorEnabled) {
  const response = await fetch(`${normalizeBaseUrl(gatewayUrl)}/api/health`, { signal: AbortSignal.timeout(5000) });
  const payload = await response.json().catch(() => ({}));
  const fresh = payload.knowledge?.freshness;
  const tone = response.status < 500 ? 'green' : 'yellow';
  console.log(`${paint('●', tone, colorEnabled)} gateway ${response.status} · mode ${modelSettings.mode} · model ${modelSettings.model} · knowledge ${fresh?.level || payload.knowledge?.status || 'optional'}`);
  return payload;
}

function safeSessionPayload(history, attachmentIds, gatewayUrl, modelSettings) {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    gatewayUrl,
    model: { endpoint: modelSettings.endpoint, model: modelSettings.model, mode: modelSettings.mode },
    history: history.map(({ role, content }) => ({ role, content })),
    attachmentIds: [...attachmentIds]
  };
}

async function saveSession(filePath, history, attachmentIds, gatewayUrl, modelSettings) {
  const target = path.resolve(filePath || `pmai-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(target, `${JSON.stringify(safeSessionPayload(history, attachmentIds, gatewayUrl, modelSettings), null, 2)}\n`, { mode: 0o600 });
  return target;
}

async function loadSession(filePath) {
  const payload = JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
  const history = Array.isArray(payload.history)
    ? payload.history.filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string')
    : [];
  const attachmentIds = Array.isArray(payload.attachmentIds)
    ? payload.attachmentIds.filter((item) => typeof item === 'string')
    : [];
  return { history, attachmentIds };
}

export async function runTerminalChat(options = {}) {
  const gatewayUrl = normalizeBaseUrl(options.gatewayUrl || 'http://127.0.0.1:8787');
  const colorEnabled = options.color !== false && process.stdout.isTTY;
  const c = (value, tone) => paint(value, tone, colorEnabled);
  let token = options.token || '';
  let modelSettings = { ...options.modelSettings };
  let history = [];
  let attachmentIds = [];
  let activeAbort = null;
  let exiting = false;

  if (!modelSettings.endpoint || !modelSettings.model) throw new Error('A custom model endpoint and model are required');

  const resetInvalidSession = () => {
    token = '';
    attachmentIds = [];
    modelSettings = { ...modelSettings, includePatientContext: false };
  };

  const ask = async (message, { silent = false } = {}) => {
    const userMessage = { role: 'user', content: message };
    const requestHistory = [...history, userMessage];
    activeAbort = new AbortController();
    if (!silent) output.write(`${c('assistant', 'blue')} ${c('›', 'dim')} `);
    let streamed = '';
    const request = (requestToken, requestAttachmentIds) => streamGatewayChat({
      gatewayUrl,
      message,
      history: requestHistory,
      token: requestToken,
      locale: options.locale || 'auto',
      attachmentIds: requestAttachmentIds,
      modelSettings,
      signal: activeAbort.signal,
      onChunk: (chunk) => { streamed += chunk; if (!silent) output.write(chunk); }
    });

    try {
      let result;
      try {
        result = await request(token, attachmentIds);
      } catch (error) {
        if (!token || !isGatewayAuthenticationError(error)) throw error;
        resetInvalidSession();
        if (!silent) output.write(`${c('[secure session expired; retrying without private context]', 'yellow')}\n`);
        result = await request('', []);
      }
      if (!silent && !streamed && result.text) output.write(result.text);
      if (!silent) output.write('\n\n');
      history.push(userMessage, { role: 'assistant', content: result.text || streamed });
      if (result.error) console.error(c(`stream warning: ${result.error}`, 'yellow'));
      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        if (!silent) output.write(`${c('[cancelled]', 'yellow')}\n\n`);
        return { cancelled: true };
      }
      if (!silent) output.write('\n');
      throw error;
    } finally {
      activeAbort = null;
    }
  };

  if (options.initialPrompt && !options.interactive) {
    const result = await ask(options.initialPrompt, { silent: Boolean(options.json) });
    if (options.json) console.log(JSON.stringify({ text: result.text || '', metadata: result.metadata || null }, null, 2));
    return result;
  }

  console.log(`${c('Potential Medical AI', 'bold')} ${c('terminal assistant', 'cyan')}`);
  console.log(`${c(gatewayUrl, 'dim')} · ${c(modelSettings.model, 'dim')} · ${c(modelSettings.mode, 'dim')} · type ${c('/help', 'cyan')} for commands\n`);
  try { await printStatus(gatewayUrl, modelSettings, colorEnabled); }
  catch (error) { console.log(c(`Gateway unavailable: ${error.message}`, 'yellow')); }
  console.log('');

  const rl = createInterface({ input, output, terminal: Boolean(process.stdin.isTTY) });
  rl.on('SIGINT', () => {
    if (activeAbort) activeAbort.abort();
    else { exiting = true; rl.close(); }
  });

  const handleSlash = async (command) => {
    if (!command) return false;
    if (['exit', 'quit', 'q'].includes(command.name)) {
      exiting = true;
      rl.close();
      return true;
    }
    if (command.name === 'help') printInteractiveHelp(colorEnabled);
    else if (command.name === 'new') {
      history = [];
      attachmentIds = [];
      console.log(c('Started a fresh in-memory conversation.', 'green'));
    } else if (command.name === 'status') await printStatus(gatewayUrl, modelSettings, colorEnabled);
    else if (command.name === 'model') {
      const endpointHost = (() => { try { return new URL(modelSettings.endpoint).host; } catch { return modelSettings.endpoint; } })();
      console.log(JSON.stringify({ endpointHost, model: modelSettings.model, mode: modelSettings.mode, apiKeyConfigured: Boolean(modelSettings.apiKey) }, null, 2));
    } else if (command.name === 'mode') {
      if (!['direct', 'document-rag', 'knowledge-rag'].includes(command.value)) throw new Error('Usage: /mode <direct|document-rag|knowledge-rag>');
      modelSettings = { ...modelSettings, mode: command.value };
      console.log(c(`Answer mode changed to ${command.value}.`, 'green'));
    } else if (command.name === 'history') {
      if (!history.length) console.log(c('Conversation is empty.', 'dim'));
      history.forEach((item, index) => console.log(`${c(`${index + 1}. ${item.role}`, item.role === 'user' ? 'cyan' : 'blue')}\n${item.content}\n`));
    } else if (command.name === 'token') {
      if (!command.value) console.log(token ? c('Session token is configured in memory.', 'green') : c('No session token configured.', 'yellow'));
      else if (command.value === 'clear') {
        resetInvalidSession();
        console.log(c('Session token and private attachment selection cleared.', 'green'));
      } else {
        token = command.value;
        attachmentIds = [];
        console.log(c('Session token set for this process only. It will be verified on first use.', 'green'));
      }
    } else if (command.name === 'attach') {
      if (!command.value) throw new Error('Usage: /attach <path>');
      const uploaded = await uploadAttachment(gatewayUrl, token, command.value);
      const id = uploaded.id || uploaded.upload?.id;
      if (!id) throw new Error('Upload completed but no attachment id was returned');
      attachmentIds = [...new Set([...attachmentIds, id])];
      console.log(`${c('Attached', 'green')} ${uploaded.filename || path.basename(command.value)} (${id})`);
    } else if (command.name === 'attachments') {
      if (!attachmentIds.length) console.log(c('No attachments selected.', 'dim'));
      else attachmentIds.forEach((id, index) => console.log(`${index + 1}. ${id}`));
    } else if (command.name === 'detach') {
      if (!command.value) throw new Error('Usage: /detach <id|all>');
      attachmentIds = command.value === 'all' ? [] : attachmentIds.filter((id) => id !== command.value);
      console.log(c('Attachment selection updated.', 'green'));
    } else if (command.name === 'context') {
      if (!token) throw new Error('Use /token <value> before reading private context');
      console.log(JSON.stringify(await apiJson(gatewayUrl, '/api/privacy/me', { token }), null, 2));
    } else if (command.name === 'save') {
      const target = await saveSession(command.value, history, attachmentIds, gatewayUrl, modelSettings);
      console.log(`${c('Saved transcript without API keys or session tokens to', 'yellow')} ${target}`);
    } else if (command.name === 'load') {
      if (!command.value) throw new Error('Usage: /load <path>');
      const loaded = await loadSession(command.value);
      history = loaded.history;
      attachmentIds = loaded.attachmentIds;
      console.log(`${c('Loaded', 'green')} ${history.length} messages and ${attachmentIds.length} attachments.`);
    } else if (command.name === 'clear') output.write('\u001bc');
    else console.log(c(`Unknown terminal command: /${command.name}. Use /help.`, 'yellow'));
    return true;
  };

  if (options.initialPrompt) {
    try { await ask(options.initialPrompt); }
    catch (error) { console.error(c(`Error: ${error.message}`, 'red')); }
  }

  while (!exiting) {
    let line;
    try { line = await rl.question(`${c('you', 'cyan')} ${c('›', 'dim')} `); }
    catch (error) {
      if (error.code === 'ERR_USE_AFTER_CLOSE') break;
      throw error;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      if (await handleSlash(parseSlashCommand(trimmed))) continue;
      await ask(trimmed);
    } catch (error) {
      if (isGatewayAuthenticationError(error)) {
        resetInvalidSession();
        console.error(c('Secure session was rejected and has been cleared. Use /token <value> to set a new one.', 'yellow'));
      } else console.error(c(`Error: ${error.message}`, 'red'));
    }
  }
  rl.close();
  console.log(c('\nSession ended. No transcript was persisted automatically.', 'dim'));
}
