import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nodeCommand = process.execPath;
const COMMANDS = new Set(['dev', 'host', 'doctor', 'status', 'sync', 'help']);
const colors = {
  cyan: '\u001b[36m', green: '\u001b[32m', yellow: '\u001b[33m', red: '\u001b[31m', gray: '\u001b[90m', reset: '\u001b[0m'
};

function color(value, tone) {
  return process.stdout.isTTY ? `${colors[tone] || ''}${value}${colors.reset}` : value;
}

function stripQuotes(value) {
  const trimmed = String(value || '').trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith('"') ? inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"') : inner;
  }
  return trimmed.replace(/\s+#.*$/, '').trim();
}

export function parseDotEnv(text = '') {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    result[key] = stripQuotes(normalized.slice(separator + 1));
  }
  return result;
}

export function parseCliArgs(argv = []) {
  const tokens = [...argv];
  let command = 'dev';
  if (tokens[0] && !tokens[0].startsWith('-')) command = tokens.shift();
  if (!COMMANDS.has(command)) throw new Error(`Unknown command: ${command}`);
  const values = { command };
  const booleanFlags = new Set(['open', 'mcp-http', 'no-sync', 'skip-build', 'json', 'help']);
  const aliases = { H: 'host', p: 'web-port', h: 'help' };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('-')) throw new Error(`Unexpected argument: ${token}`);
    const raw = token.replace(/^--?/, '');
    const [rawKey, inlineValue] = raw.split(/=(.*)/s, 2);
    const key = aliases[rawKey] || rawKey;
    if (booleanFlags.has(key)) {
      values[key] = inlineValue === undefined ? true : inlineValue !== 'false';
      continue;
    }
    const next = inlineValue === undefined ? tokens[++index] : inlineValue;
    if (next === undefined || next.startsWith('-')) throw new Error(`Missing value for --${key}`);
    values[key] = next;
  }
  if (values.help) values.command = 'help';
  return values;
}

function numeric(value, fallback, name) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error(`${name} must be a port between 1 and 65535`);
  return parsed;
}

function firstLanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return 'localhost';
}

function displayHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function resolveRuntime(args, env = process.env, cwd = root) {
  const command = args.command || 'dev';
  const bindHost = args.host || env.PMAI_HOST || '127.0.0.1';
  const publicHost = args['public-host'] || env.PMAI_PUBLIC_HOST || (['0.0.0.0', '::'].includes(bindHost) ? firstLanAddress() : (bindHost === '127.0.0.1' ? 'localhost' : bindHost));
  const webPort = numeric(args['web-port'], env.PMAI_WEB_PORT || 3000, 'web port');
  const gatewayPort = numeric(args['gateway-port'], env.PORT || 8787, 'gateway port');
  const knowledgePort = numeric(args['knowledge-port'], env.KNOWLEDGE_PLANE_PORT || 8790, 'knowledge port');
  const historyPort = numeric(args['history-port'], env.PMAI_HISTORY_PORT || 3001, 'history port');
  const mcpPort = numeric(args['mcp-port'], env.MCP_HTTP_PORT || 8791, 'MCP port');
  const hostForUrl = displayHost(publicHost);
  const localHost = '127.0.0.1';
  const appPort = command === 'dev' ? webPort : gatewayPort;
  const appUrl = `http://${hostForUrl}:${appPort}`;
  const historyUrl = `http://${hostForUrl}:${historyPort}`;
  const envFile = path.resolve(cwd, args['env-file'] || env.PMAI_ENV_FILE || '.env');
  const allowedOrigins = unique([
    ...(env.ALLOWED_ORIGINS || '').split(',').map((item) => item.trim()),
    appUrl,
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`,
    `http://localhost:${gatewayPort}`,
    `http://127.0.0.1:${gatewayPort}`
  ]).join(',');
  return {
    command,
    cwd,
    envFile,
    bindHost,
    publicHost,
    webPort,
    gatewayPort,
    knowledgePort,
    historyPort,
    mcpPort,
    appUrl,
    historyUrl,
    open: Boolean(args.open),
    mcpHttp: Boolean(args['mcp-http']) || env.MCP_HTTP_ENABLED === 'true',
    noSync: Boolean(args['no-sync']),
    skipBuild: Boolean(args['skip-build']),
    json: Boolean(args.json),
    sources: String(args.sources || '').split(',').map((item) => item.trim()).filter(Boolean),
    serviceEnv: {
      ...env,
      PORT: String(gatewayPort),
      HOST: bindHost,
      KNOWLEDGE_PLANE_PORT: String(knowledgePort),
      KNOWLEDGE_PLANE_HOST: env.KNOWLEDGE_PLANE_HOST || localHost,
      KNOWLEDGE_PLANE_URL: `http://${localHost}:${knowledgePort}`,
      MEDICAL_API_PROXY_TARGET: `http://${localHost}:${gatewayPort}`,
      VITE_MEDICAL_API_URL: '',
      VITE_API_BASE_URL: historyUrl,
      ALLOWED_ORIGINS: allowedOrigins,
      APP_PUBLIC_URL: appUrl,
      SYNC_ENABLED: args['no-sync'] ? 'false' : (env.SYNC_ENABLED || 'true'),
      MCP_HTTP_ENABLED: (Boolean(args['mcp-http']) || env.MCP_HTTP_ENABLED === 'true') ? 'true' : 'false',
      MCP_HTTP_PORT: String(mcpPort)
    }
  };
}

export function createServicePlan(runtime) {
  const host = runtime.bindHost;
  const local = '127.0.0.1';
  const services = [
    { key: 'knowledge', label: 'knowledge', command: nodeCommand, args: ['knowledge-plane/server.js'], port: runtime.knowledgePort, checkHost: runtime.serviceEnv.KNOWLEDGE_PLANE_HOST || local, healthUrl: `http://${local}:${runtime.knowledgePort}/health` },
    { key: 'history', label: 'history', command: npmCommand, args: ['run', 'server:chat-history', '--', '--host', host, '--port', String(runtime.historyPort)], port: runtime.historyPort, checkHost: host, healthUrl: `http://${local}:${runtime.historyPort}/chats` },
    { key: 'gateway', label: 'gateway', command: nodeCommand, args: ['server/server.js'], port: runtime.gatewayPort, checkHost: host, healthUrl: `http://${local}:${runtime.gatewayPort}/api/health` }
  ];
  if (runtime.mcpHttp) services.push({ key: 'mcp', label: 'mcp-http', command: nodeCommand, args: ['knowledge-plane/mcp-http.js'], port: runtime.mcpPort, checkHost: runtime.serviceEnv.MCP_HTTP_HOST || local, healthUrl: `http://${local}:${runtime.mcpPort}/health` });
  if (runtime.command === 'dev') services.push({ key: 'web', label: 'web', command: npmCommand, args: ['run', 'dev:web', '--', '--host', host, '--port', String(runtime.webPort), '--strictPort', ...(runtime.open ? ['--open'] : [])], port: runtime.webPort, checkHost: host, healthUrl: `http://${local}:${runtime.webPort}` });
  return services;
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

async function portIsFree(port, host = '127.0.0.1') {
  const listenHost = host === 'localhost' ? '127.0.0.1' : host;
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ port, host: listenHost, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

async function waitForUrl(url, child, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child?.exitCode !== null) throw new Error(`${child.__label || 'service'} exited before becoming ready`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      return response.status;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function prefixStream(stream, label, target) {
  let pending = '';
  stream?.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) if (line) target.write(`${color(`[${label}]`, 'gray')} ${line}\n`);
  });
  stream?.on('end', () => { if (pending) target.write(`${color(`[${label}]`, 'gray')} ${pending}\n`); });
}

function spawnService(spec, runtime, onUnexpectedExit) {
  const child = spawn(spec.command, spec.args, {
    cwd: runtime.cwd,
    env: runtime.serviceEnv,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.__label = spec.label;
  prefixStream(child.stdout, spec.label, process.stdout);
  prefixStream(child.stderr, spec.label, process.stderr);
  child.once('exit', (code, signal) => onUnexpectedExit?.(child, code, signal));
  return child;
}

function terminate(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

async function runCommand(label, command, args, runtime) {
  console.log(color(`\n→ ${label}`, 'cyan'));
  const child = spawn(command, args, { cwd: runtime.cwd, env: runtime.serviceEnv, stdio: 'inherit' });
  const code = await new Promise((resolve) => child.once('exit', (exitCode) => resolve(exitCode ?? 1)));
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}`);
}

function printUrls(runtime) {
  console.log(color('\nPotential Medical AI is ready', 'green'));
  console.log(`  App:       ${runtime.appUrl}`);
  console.log(`  Gateway:   http://${displayHost(runtime.publicHost)}:${runtime.gatewayPort}/api/health`);
  console.log(`  Knowledge: http://127.0.0.1:${runtime.knowledgePort}/health`);
  console.log(`  History:   ${runtime.historyUrl}`);
  if (runtime.mcpHttp) console.log(`  MCP HTTP:  http://127.0.0.1:${runtime.mcpPort}`);
  if (['0.0.0.0', '::'].includes(runtime.bindHost)) console.log(color('  LAN hosting enabled. Do not expose the bundled json-server history service to the public internet.', 'yellow'));
  console.log(color('  Press Ctrl+C to stop every process.\n', 'gray'));
}

async function openUrl(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function runStack(runtime) {
  if (!existsSync(path.join(runtime.cwd, 'node_modules'))) throw new Error('node_modules is missing. Run npm install first.');
  if (runtime.command === 'host' && !runtime.skipBuild) await runCommand('Building production frontend', npmCommand, ['run', 'build'], runtime);
  const plan = createServicePlan(runtime);
  const seenPorts = new Set();
  for (const service of plan) {
    if (seenPorts.has(service.port)) throw new Error(`Port ${service.port} is assigned to more than one service`);
    seenPorts.add(service.port);
    if (!(await portIsFree(service.port, service.checkHost))) throw new Error(`${service.label} port ${service.port} is already in use`);
  }

  const children = [];
  let stopping = false;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const shutdown = async (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of [...children].reverse()) terminate(child);
    await new Promise((resolve) => setTimeout(resolve, 450));
    for (const child of children) terminate(child, 'SIGKILL');
    finish(code);
  };
  const onUnexpectedExit = (child, code, signal) => {
    if (!stopping) {
      console.error(color(`${child.__label} exited unexpectedly (${signal || code || 0})`, 'red'));
      shutdown(code || 1);
    }
  };
  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));

  try {
    for (const service of plan) {
      console.log(color(`Starting ${service.label}…`, 'cyan'));
      const child = spawnService(service, runtime, onUnexpectedExit);
      children.push(child);
      const status = await waitForUrl(service.healthUrl, child, service.key === 'web' ? 45_000 : 30_000);
      console.log(`${color('✓', 'green')} ${service.label} reachable${status >= 400 ? ` (HTTP ${status}, degraded/locked is expected before sync)` : ''}`);
    }
    printUrls(runtime);
    if (runtime.open && runtime.command === 'host') await openUrl(runtime.appUrl).catch(() => {});
    const code = await done;
    process.exitCode = code;
  } catch (error) {
    await shutdown(1);
    throw error;
  }
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500) });
    const payload = await response.json().catch(() => ({}));
    return { reachable: true, statusCode: response.status, payload };
  } catch (error) {
    return { reachable: false, error: error.message };
  }
}

async function runStatus(runtime) {
  const result = {
    gateway: await fetchStatus(`http://127.0.0.1:${runtime.gatewayPort}/api/health`),
    knowledge: await fetchStatus(`http://127.0.0.1:${runtime.knowledgePort}/health`),
    history: await fetchStatus(`http://127.0.0.1:${runtime.historyPort}/chats`)
  };
  if (runtime.json) console.log(JSON.stringify(result, null, 2));
  else for (const [name, value] of Object.entries(result)) console.log(`${value.reachable ? color('●', value.statusCode < 400 ? 'green' : 'yellow') : color('●', 'red')} ${name.padEnd(10)} ${value.reachable ? `HTTP ${value.statusCode}` : value.error}`);
  if (Object.values(result).every((value) => !value.reachable)) process.exitCode = 1;
}

function isPlaceholder(value = '') {
  return !value || /replace-with|changeme|example|your[-_ ]/i.test(value);
}

async function runDoctor(runtime, env) {
  const checks = [];
  const add = (name, ok, detail, level = ok ? 'ok' : 'error') => checks.push({ name, ok, detail, level });
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add('Node.js', nodeMajor >= 20, process.version);
  add('package.json', existsSync(path.join(runtime.cwd, 'package.json')), runtime.cwd);
  add('dependencies', existsSync(path.join(runtime.cwd, 'node_modules')), existsSync(path.join(runtime.cwd, 'node_modules')) ? 'installed' : 'run npm install');
  add('.env', existsSync(runtime.envFile), existsSync(runtime.envFile) ? runtime.envFile : 'optional; copy env.example to .env', existsSync(runtime.envFile) ? 'ok' : 'warn');
  add('model provider', Boolean(env.OPENROUTER_API_KEY || env.GOOGLE_AI_API_KEY), env.OPENROUTER_API_KEY || env.GOOGLE_AI_API_KEY ? 'configured' : 'chat generation will be unavailable', env.OPENROUTER_API_KEY || env.GOOGLE_AI_API_KEY ? 'ok' : 'warn');
  add('admin token', !isPlaceholder(env.API_ADMIN_TOKEN), isPlaceholder(env.API_ADMIN_TOKEN) ? 'required for manual sync/admin operations' : 'configured', isPlaceholder(env.API_ADMIN_TOKEN) ? 'warn' : 'ok');
  add('privacy secrets', !isPlaceholder(env.USER_SESSION_SIGNING_KEY) && !isPlaceholder(env.USER_DATA_ENCRYPTION_KEY), 'required for consent, uploads and sharing', (!isPlaceholder(env.USER_SESSION_SIGNING_KEY) && !isPlaceholder(env.USER_DATA_ENCRYPTION_KEY)) ? 'ok' : 'warn');
  for (const [name, port, host] of [['web', runtime.webPort, runtime.bindHost], ['gateway', runtime.gatewayPort, runtime.bindHost], ['knowledge', runtime.knowledgePort, runtime.serviceEnv.KNOWLEDGE_PLANE_HOST], ['history', runtime.historyPort, runtime.bindHost]]) {
    const free = await portIsFree(port, host);
    add(`${name} port`, free, `${host}:${port}${free ? ' available' : ' already in use'}`, free ? 'ok' : 'warn');
  }
  if (runtime.command === 'host' || runtime.skipBuild) add('production build', existsSync(path.join(runtime.cwd, 'dist', 'index.html')), existsSync(path.join(runtime.cwd, 'dist', 'index.html')) ? 'dist/index.html exists' : 'run pmai host or npm run build', existsSync(path.join(runtime.cwd, 'dist', 'index.html')) ? 'ok' : 'warn');
  if (runtime.json) console.log(JSON.stringify(checks, null, 2));
  else for (const check of checks) {
    const tone = check.level === 'ok' ? 'green' : check.level === 'warn' ? 'yellow' : 'red';
    const symbol = check.level === 'ok' ? '✓' : check.level === 'warn' ? '!' : '✗';
    console.log(`${color(symbol, tone)} ${check.name.padEnd(18)} ${check.detail}`);
  }
  if (checks.some((check) => check.level === 'error')) process.exitCode = 1;
}

async function runSync(runtime, env) {
  if (isPlaceholder(env.API_ADMIN_TOKEN)) throw new Error('API_ADMIN_TOKEN must be configured before manual synchronization');
  const response = await fetch(`http://127.0.0.1:${runtime.knowledgePort}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.API_ADMIN_TOKEN}` },
    body: JSON.stringify(runtime.sources.length ? { sources: runtime.sources } : {})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Sync failed with HTTP ${response.status}`);
  console.log(JSON.stringify(payload, null, 2));
}

function printHelp() {
  console.log(`Potential Medical AI CLI\n\nUsage:\n  pmai dev [options]       Run Vite, chat gateway, knowledge plane and chat history\n  pmai host [options]      Build once, then host the complete local/LAN stack\n  pmai doctor [options]    Check dependencies, secrets and ports\n  pmai status [options]    Show health of running services\n  pmai sync [--sources x]  Trigger an authenticated knowledge sync\n\nOptions:\n  --host <address>         Bind public services (default 127.0.0.1; use 0.0.0.0 for LAN)\n  --public-host <address>  Browser-visible hostname/IP used in built URLs\n  --web-port <port>        Vite port (default 3000)\n  --gateway-port <port>    Gateway/static host port (default 8787)\n  --knowledge-port <port>  Private knowledge plane port (default 8790)\n  --history-port <port>    Chat-history json-server port (default 3001)\n  --mcp-http               Start authenticated Streamable HTTP MCP\n  --mcp-port <port>        MCP HTTP port (default 8791)\n  --no-sync                Disable automatic source synchronization\n  --skip-build             Host existing dist without rebuilding\n  --open                   Open the app after startup\n  --env-file <path>        Load another env file (default .env)\n  --json                   Machine-readable doctor/status output\n\nExamples:\n  npm run dev\n  npm run host -- --host 0.0.0.0 --public-host 192.168.1.25 --open\n  node bin/pmai.js doctor\n  node bin/pmai.js sync --sources pubmed,clinicaltrials.gov\n`);
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseCliArgs(argv);
  if (args.command === 'help') return printHelp();
  const envFile = path.resolve(root, args['env-file'] || '.env');
  const env = await loadEnvironment(envFile);
  const runtime = resolveRuntime(args, env, root);
  runtime.envFile = envFile;
  if (runtime.command === 'doctor') return runDoctor(runtime, env);
  if (runtime.command === 'status') return runStatus(runtime);
  if (runtime.command === 'sync') return runSync(runtime, env);
  return runStack(runtime);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(color(`\nCLI error: ${error.message}`, 'red'));
    process.exitCode = 1;
  });
}
