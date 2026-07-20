import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const MIME_TYPES = {
  '.txt': 'text/plain',
  '.md': 'text/plain',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg'
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

function headers(token, extra = {}) {
  return { ...extra, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function errorMessage(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.error || payload.message || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
  }
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
    try {
      events.push(JSON.parse(data));
    } catch {
      events.push({ type: 'malformed', raw: data });
    }
  }
  return { events, rest };
}

export async function streamGatewayChat({ gatewayUrl, message, history = [], token = '', locale = 'auto', attachmentIds = [], signal, onChunk }) {
  const response = await fetch(`${normalizeBaseUrl(gatewayUrl)}/api/chat/stream`, {
    method: 'POST',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      message,
      history: history.slice(-40).map(({ role, content }) => ({ role, content })),
      locale,
      attachmentIds: attachmentIds.slice(0, 8)
    }),
    signal
  });
  if (!response.ok || !response.body) throw new Error(await errorMessage(response));

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
  if (streamError && !text) throw new Error(streamError);
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
    headers: headers(token, body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal
  });
  if (!response.ok) throw new Error(await errorMessage(response));
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
  ${c('/status', 'cyan')}               Show gateway and knowledge freshness
  ${c('/history', 'cyan')}              Print the current conversation
  ${c('/attach <path>', 'cyan')}        Upload and attach a document or image
  ${c('/attachments', 'cyan')}          List selected attachments
  ${c('/detach <id|all>', 'cyan')}      Remove selected attachments
  ${c('/token <value|clear>', 'cyan')}  Set a private session token in memory
  ${c('/context', 'cyan')}              Read consented patient context
  ${c('/save [path]', 'cyan')}          Explicitly save this session as JSON
  ${c('/load <path>', 'cyan')}          Load a previously saved session
  ${c('/clear', 'cyan')}                Clear the terminal screen
  ${c('/exit', 'cyan')}                 Quit

No transcript is persisted unless you run /save.`);
}

async function printStatus(gatewayUrl, colorEnabled) {
  const response = await fetch(`${normalizeBaseUrl(gatewayUrl)}/api/health`, { signal: AbortSignal.timeout(5000) });
  const payload = await response.json().catch(() => ({}));
  const fresh = payload.knowledge?.freshness;
  const tone = response.ok && payload.status === 'ok' ? 'green' : 'yellow';
  console.log(`${paint('●', tone, colorEnabled)} gateway ${response.status} · knowledge ${fresh?.level || payload.knowledge?.status || 'unknown'}${fresh?.usable === false ? ' · fail-closed' : ''}`);
  return payload;
}

function safeSessionPayload(history, attachmentIds, gatewayUrl) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    gatewayUrl,
    history: history.map(({ role, content }) => ({ role, content })),
    attachmentIds: [...attachmentIds]
  };
}

async function saveSession(filePath, history, attachmentIds, gatewayUrl) {
  const target = path.resolve(filePath || `pmai-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await fs.writeFile(target, `${JSON.stringify(safeSessionPayload(history, attachmentIds, gatewayUrl), null, 2)}\n`, { mode: 0o600 });
  return target;
}

async function loadSession(filePath) {
  const payload = JSON.parse(await fs.readFile(path.resolve(filePath), 'utf8'));
  const history = Array.isArray(payload.history) ? payload.history.filter((item) => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string') : [];
  const attachmentIds = Array.isArray(payload.attachmentIds) ? payload.attachmentIds.filter((item) => typeof item === 'string') : [];
  return { history, attachmentIds };
}

export async function runTerminalChat(options = {}) {
  const gatewayUrl = normalizeBaseUrl(options.gatewayUrl || 'http://127.0.0.1:8787');
  const colorEnabled = options.color !== false && process.stdout.isTTY;
  const c = (value, tone) => paint(value, tone, colorEnabled);
  let token = options.token || '';
  let history = [];
  let attachmentIds = [];
  let activeAbort = null;
  let exiting = false;

  const ask = async (message, { silent = false } = {}) => {
    const userMessage = { role: 'user', content: message };
    const requestHistory = [...history, userMessage];
    activeAbort = new AbortController();
    if (!silent) output.write(`${c('assistant', 'blue')} ${c('›', 'dim')} `);
    let streamed = '';
    try {
      const result = await streamGatewayChat({
        gatewayUrl,
        message,
        history: requestHistory,
        token,
        locale: options.locale || 'auto',
        attachmentIds,
        signal: activeAbort.signal,
        onChunk: (chunk) => { streamed += chunk; if (!silent) output.write(chunk); }
      });
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
  console.log(`${c(gatewayUrl, 'dim')} · type ${c('/help', 'cyan')} for commands · ${c('Ctrl+C', 'dim')} cancels or exits\n`);
  try {
    await printStatus(gatewayUrl, colorEnabled);
  } catch (error) {
    console.log(c(`Gateway unavailable: ${error.message}`, 'yellow'));
  }
  console.log('');

  const rl = createInterface({ input, output, terminal: Boolean(process.stdin.isTTY) });
  rl.on('SIGINT', () => {
    if (activeAbort) activeAbort.abort();
    else {
      exiting = true;
      rl.close();
    }
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
    } else if (command.name === 'status') await printStatus(gatewayUrl, colorEnabled);
    else if (command.name === 'history') {
      if (!history.length) console.log(c('Conversation is empty.', 'dim'));
      history.forEach((item, index) => console.log(`${c(`${index + 1}. ${item.role}`, item.role === 'user' ? 'cyan' : 'blue')}\n${item.content}\n`));
    } else if (command.name === 'token') {
      if (!command.value) console.log(token ? c('Session token is configured in memory.', 'green') : c('No session token configured.', 'yellow'));
      else if (command.value === 'clear') {
        token = '';
        console.log(c('Session token cleared.', 'green'));
      } else {
        token = command.value;
        console.log(c('Session token set for this process only.', 'green'));
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
      const target = await saveSession(command.value, history, attachmentIds, gatewayUrl);
      console.log(`${c('Saved sensitive session data to', 'yellow')} ${target}`);
    } else if (command.name === 'load') {
      if (!command.value) throw new Error('Usage: /load <path>');
      const loaded = await loadSession(command.value);
      history = loaded.history;
      attachmentIds = loaded.attachmentIds;
      console.log(`${c('Loaded', 'green')} ${history.length} messages and ${attachmentIds.length} attachments.`);
    } else if (command.name === 'clear') {
      output.write('\u001bc');
    } else console.log(c(`Unknown terminal command: /${command.name}. Use /help.`, 'yellow'));
    return true;
  };

  if (options.initialPrompt) {
    try { await ask(options.initialPrompt); } catch (error) { console.error(c(`Error: ${error.message}`, 'red')); }
  }

  while (!exiting) {
    let line;
    try {
      line = await rl.question(`${c('you', 'cyan')} ${c('›', 'dim')} `);
    } catch (error) {
      if (error.code === 'ERR_USE_AFTER_CLOSE') break;
      throw error;
    }
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      if (await handleSlash(parseSlashCommand(trimmed))) continue;
      await ask(trimmed);
    } catch (error) {
      console.error(c(`Error: ${error.message}`, 'red'));
    }
  }
  rl.close();
  console.log(c('\nSession ended. No transcript was persisted automatically.', 'dim'));
}
