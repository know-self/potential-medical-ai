import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDotEnv } from './pmai-cli.js';
import { runTerminalChat } from './pmai-chat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROCESS_COMMANDS = new Set(['dev', 'host', 'doctor', 'status', 'sync']);
const TERMINAL_COMMANDS = new Set(['chat', 'ask']);

export function shouldRunProcessCommand(argv = []) {
  return PROCESS_COMMANDS.has(argv[0]);
}

export function parseTerminalArgs(argv = []) {
  const tokens = [...argv];
  let command = 'chat';
  let explicitTerminalCommand = false;
  if (TERMINAL_COMMANDS.has(tokens[0])) {
    command = tokens.shift();
    explicitTerminalCommand = true;
  }
  const values = { command, positionals: [] };
  const booleans = new Set(['no-start', 'json', 'no-color', 'no-sync', 'help', 'include-patient-context']);
  const aliases = { h: 'help' };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('-')) {
      values.positionals.push(token);
      continue;
    }
    const raw = token.replace(/^--?/, '');
    const [rawKey, inlineValue] = raw.split(/=(.*)/s, 2);
    const key = aliases[rawKey] || rawKey;
    if (booleans.has(key)) {
      values[key] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    const next = inlineValue === undefined ? tokens[++index] : inlineValue;
    if (next === undefined || next.startsWith('-')) throw new Error(`Missing value for --${key}`);
    values[key] = next;
  }
  if (values.help) values.command = 'help';
  if (!explicitTerminalCommand && values.command === 'chat' && values.positionals.length) values.command = 'ask';
  if (values.command === 'ask' && !values.positionals.length) throw new Error('Usage: pmai ask <question>');
  if (values.command === 'chat' && values.positionals.length) values.initialPrompt = values.positionals.join(' ');
  if (values.command === 'ask') values.initialPrompt = values.positionals.join(' ');
  return values;
}

async function loadEnvironment(envFile) {
  let fileValues = {};
  try {
    fileValues = parseDotEnv(await fs.readFile(envFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ...fileValues, ...process.env };
}

function integerPort(value, fallback, label) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${label} must be between 1 and 65535`);
  return port;
}

function numeric(value, fallback, min, max, label) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return number;
}

function localGateway(value) {
  try {
    const url = new URL(value);
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return { reachable: true, status: response.status };
  } catch (error) {
    return { reachable: false, error: error.message };
  }
}

function prefix(stream, label) {
  let pending = '';
  stream?.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) if (line) process.stderr.write(`[${label}] ${line}\n`);
  });
}

function spawnLocal(label, script, env) {
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  prefix(child.stdout, label);
  prefix(child.stderr, label);
  return child;
}

function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function waitFor(url, child, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child && child.exitCode !== null) throw new Error(`Local service exited before ${url} became reachable`);
    const state = await reachable(url);
    if (state.reachable) return state;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startLocalTerminalRuntime({ env, gatewayUrl, gatewayPort, knowledgePort, noSync, mode }) {
  const children = [];
  const knowledgeUrl = `http://127.0.0.1:${knowledgePort}/health`;
  const gatewayHealthUrl = `${gatewayUrl}/api/health`;
  const serviceEnv = {
    ...env,
    PORT: String(gatewayPort),
    HOST: '127.0.0.1',
    KNOWLEDGE_PLANE_PORT: String(knowledgePort),
    KNOWLEDGE_PLANE_HOST: '127.0.0.1',
    KNOWLEDGE_PLANE_URL: `http://127.0.0.1:${knowledgePort}`,
    ALLOWED_ORIGINS: env.ALLOWED_ORIGINS || 'http://localhost',
    APP_PUBLIC_URL: gatewayUrl,
    SYNC_ENABLED: noSync ? 'false' : (env.SYNC_ENABLED || 'true')
  };

  if (mode === 'knowledge-rag' && !(await reachable(knowledgeUrl)).reachable) {
    process.stderr.write('Starting local knowledge plane…\n');
    const knowledge = spawnLocal('knowledge', 'scripts/service-bootstrap.js', { ...serviceEnv, PMAI_BOOTSTRAP_SERVICE: 'knowledge' });
    knowledge.spawnargs = [process.execPath, 'scripts/service-bootstrap.js', 'knowledge'];
    children.push(knowledge);
    await waitFor(knowledgeUrl, knowledge);
  }
  if (!(await reachable(gatewayHealthUrl)).reachable) {
    process.stderr.write('Starting local chat gateway…\n');
    const gateway = spawn(process.execPath, ['scripts/service-bootstrap.js', 'gateway'], {
      cwd: root,
      env: serviceEnv,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    prefix(gateway.stdout, 'gateway');
    prefix(gateway.stderr, 'gateway');
    children.push(gateway);
    await waitFor(gatewayHealthUrl, gateway);
  }

  return async () => {
    for (const child of [...children].reverse()) stopChild(child);
    if (children.length) await new Promise((resolve) => setTimeout(resolve, 350));
    for (const child of children) stopChild(child, 'SIGKILL');
  };
}

async function readPipedPrompt() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk.toString();
  return text.trim();
}

export function printUnifiedHelp() {
  console.log(`Potential Medical AI terminal CLI

Usage:
  pmai                         Open the interactive terminal assistant
  pmai "question"              Ask once and exit
  pmai ask <question>          Ask once and exit
  pmai chat [first question]   Open chat, optionally asking first
  pmai dev [options]           Run the complete web development stack
  pmai host [options]          Build and host the complete stack
  pmai doctor                  Check local configuration
  pmai status                  Check running services
  pmai sync                    Trigger authenticated knowledge sync

Custom model options:
  --model-endpoint <url>       OpenAI-compatible chat-completions endpoint
  --model <name>               Model identifier required by the endpoint
  --model-key <key>            Optional API key; kept only in this process
  --mode <mode>                direct, document-rag, or knowledge-rag
  --temperature <number>       0 to 2
  --max-tokens <number>        64 to 32768
  --system-prompt <text>       Additional instruction after core safety rules
  --include-patient-context    Include consented context when a session token is set

Other terminal options:
  --gateway-url <url>          Use an existing local or remote gateway
  --session-token <token>      Private user session token for context/uploads
  --locale <locale>            auto, en, vi, or another supported locale
  --no-start                   Do not auto-start local services
  --no-sync                    Disable source sync when auto-starting locally
  --json                       JSON output for one-shot asks
  --no-color                   Disable ANSI styling
  --env-file <path>            Load another environment file
  --gateway-port <port>        Local auto-start gateway port (default 8787)
  --knowledge-port <port>      Local knowledge port (default 8790)

Environment equivalents:
  PMAI_MODEL_ENDPOINT, PMAI_MODEL_NAME, PMAI_MODEL_API_KEY, PMAI_MODEL_MODE

Examples:
  pmai --model-endpoint http://127.0.0.1:1234/v1 --model local-model
  pmai ask "Explain CKD staging" --model-endpoint https://models.example.com/v1 --model med-model --model-key secret
  pmai dev --open
`);
}

export async function runTerminalCli(argv = process.argv.slice(2)) {
  const args = parseTerminalArgs(argv);
  if (args.command === 'help') return printUnifiedHelp();
  const envFile = path.resolve(root, args['env-file'] || '.env');
  const env = await loadEnvironment(envFile);
  const gatewayPort = integerPort(args['gateway-port'], env.PORT || 8787, 'gateway port');
  const knowledgePort = integerPort(args['knowledge-port'], env.KNOWLEDGE_PLANE_PORT || 8790, 'knowledge port');
  const explicitGateway = args['gateway-url'] || env.PMAI_GATEWAY_URL;
  const gatewayUrl = String(explicitGateway || `http://127.0.0.1:${gatewayPort}`).replace(/\/+$/, '');
  const initialPrompt = args.initialPrompt || await readPipedPrompt();
  const interactive = args.command === 'chat' && Boolean(process.stdin.isTTY);
  if (args.command === 'ask' && !initialPrompt) throw new Error('A question is required');
  if (!interactive && !initialPrompt) throw new Error('No prompt received. Run pmai in a terminal or pass a question.');

  const modelSettings = {
    endpoint: args['model-endpoint'] || env.PMAI_MODEL_ENDPOINT || '',
    model: args.model || env.PMAI_MODEL_NAME || '',
    apiKey: args['model-key'] || env.PMAI_MODEL_API_KEY || '',
    mode: args.mode || env.PMAI_MODEL_MODE || 'direct',
    temperature: numeric(args.temperature, env.PMAI_MODEL_TEMPERATURE || 0.2, 0, 2, 'temperature'),
    maxTokens: Math.round(numeric(args['max-tokens'], env.PMAI_MODEL_MAX_TOKENS || 4096, 64, 32768, 'max tokens')),
    systemPrompt: args['system-prompt'] || env.PMAI_MODEL_SYSTEM_PROMPT || '',
    includePatientContext: Boolean(args['include-patient-context']) || env.PMAI_MODEL_INCLUDE_PATIENT_CONTEXT === 'true',
    headers: {}
  };
  if (!modelSettings.endpoint || !modelSettings.model) {
    throw new Error('Configure a custom model with --model-endpoint and --model, or PMAI_MODEL_ENDPOINT and PMAI_MODEL_NAME');
  }

  if (!existsSync(path.join(root, 'package.json'))) throw new Error('Run pmai from an installed Potential Medical AI package');
  let cleanup = async () => {};
  const canAutoStart = !args['no-start'] && !explicitGateway && localGateway(gatewayUrl);
  if (!(await reachable(`${gatewayUrl}/api/health`)).reachable && canAutoStart) {
    if (!existsSync(path.join(root, 'node_modules'))) throw new Error('node_modules is missing. Run npm install first.');
    cleanup = await startLocalTerminalRuntime({ env, gatewayUrl, gatewayPort, knowledgePort, noSync: Boolean(args['no-sync']), mode: modelSettings.mode });
  }

  try {
    return await runTerminalChat({
      gatewayUrl,
      token: args['session-token'] || env.PMAI_SESSION_TOKEN || '',
      locale: args.locale || env.PMAI_LOCALE || 'auto',
      modelSettings,
      color: !args['no-color'],
      json: Boolean(args.json),
      initialPrompt,
      interactive
    });
  } finally {
    await cleanup();
  }
}
