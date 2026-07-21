import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { parseCliArgs, parseDotEnv, resolveRuntime, runCli } from './pmai-cli.js';
import { runTerminalChat } from './pmai-chat.js';
import { parseTerminalArgs, printUnifiedHelp } from './pmai-terminal-cli.js';
import { createServiceInvocation, createToolInvocation, projectRoot } from './local-command.js';

const processCommands = new Set(['dev', 'host', 'doctor', 'status', 'sync']);
const colors = {
  cyan: '\u001b[36m', green: '\u001b[32m', yellow: '\u001b[33m', red: '\u001b[31m', gray: '\u001b[90m', reset: '\u001b[0m'
};

function color(value, tone) {
  return process.stdout.isTTY ? `${colors[tone] || ''}${value}${colors.reset}` : value;
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

async function reachable(url, timeoutMs = 2500) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return { reachable: true, status: response.status };
  } catch (error) {
    return { reachable: false, error: error.message };
  }
}

async function waitFor(url, child, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child?.__spawnError) throw child.__spawnError;
    if (child && child.exitCode !== null) throw new Error(`${child.__label || 'Local service'} exited before ${url} became reachable`);
    const state = await reachable(url, 1500);
    if (state.reachable) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function prefix(stream, label, target = process.stderr) {
  let pending = '';
  stream?.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || '';
    for (const line of lines) if (line) target.write(`${color(`[${label}]`, 'gray')} ${line}\n`);
  });
  stream?.on('end', () => {
    if (pending) target.write(`${color(`[${label}]`, 'gray')} ${pending}\n`);
  });
}

function spawnInvocation(invocation, { cwd, env, label, inherit = false, onExit } = {}) {
  if (!existsSync(invocation.args[0])) throw new Error(`Required local executable was not found: ${invocation.args[0]}. Run npm install.`);
  const child = spawn(invocation.command, invocation.args, {
    cwd,
    env,
    windowsHide: false,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
  });
  child.__label = label;
  child.once('error', (error) => {
    child.__spawnError = error;
    onExit?.(child, 1, null, error);
  });
  child.once('exit', (code, signal) => onExit?.(child, code, signal, null));
  if (!inherit) {
    prefix(child.stdout, label, process.stdout);
    prefix(child.stderr, label, process.stderr);
  }
  return child;
}

function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.exitCode !== null) return;
  try {
    child.kill(signal);
  } catch {
    // The process may already have exited between the state check and kill.
  }
}

async function runInvocation(label, invocation, runtime) {
  console.log(color(`\n→ ${label}`, 'cyan'));
  const child = spawnInvocation(invocation, { cwd: runtime.cwd, env: runtime.serviceEnv, label, inherit: true });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}`);
}

export function createWindowsServicePlan(runtime) {
  const host = runtime.bindHost;
  const local = '127.0.0.1';
  const services = [
    {
      key: 'knowledge', label: 'knowledge', invocation: createServiceInvocation('knowledge', runtime.cwd),
      port: runtime.knowledgePort, checkHost: runtime.serviceEnv.KNOWLEDGE_PLANE_HOST || local,
      healthUrl: `http://${local}:${runtime.knowledgePort}/health`
    },
    {
      key: 'history', label: 'history',
      invocation: createToolInvocation('json-server', ['--watch', 'db.json', '--host', host, '--port', String(runtime.historyPort)], runtime.cwd),
      port: runtime.historyPort, checkHost: host, healthUrl: `http://${local}:${runtime.historyPort}/chats`
    },
    {
      key: 'gateway', label: 'gateway', invocation: createServiceInvocation('gateway', runtime.cwd),
      port: runtime.gatewayPort, checkHost: host, healthUrl: `http://${local}:${runtime.gatewayPort}/api/health`
    }
  ];
  if (runtime.mcpHttp) {
    services.push({
      key: 'mcp', label: 'mcp-http', invocation: createServiceInvocation('mcp-http', runtime.cwd),
      port: runtime.mcpPort, checkHost: runtime.serviceEnv.MCP_HTTP_HOST || local,
      healthUrl: `http://${local}:${runtime.mcpPort}/health`
    });
  }
  if (runtime.command === 'dev') {
    services.push({
      key: 'web', label: 'web',
      invocation: createToolInvocation('vite', ['--host', host, '--port', String(runtime.webPort), '--strictPort', ...(runtime.open ? ['--open'] : [])], runtime.cwd),
      port: runtime.webPort, checkHost: host, healthUrl: `http://${local}:${runtime.webPort}`
    });
  }
  return services;
}

function displayHost(host) {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function printUrls(runtime) {
  console.log(color('\nPotential Medical AI is ready', 'green'));
  console.log(`  App:       ${runtime.appUrl}`);
  console.log(`  Gateway:   http://${displayHost(runtime.publicHost)}:${runtime.gatewayPort}/api/health`);
  console.log(`  Knowledge: http://127.0.0.1:${runtime.knowledgePort}/health`);
  console.log(`  History:   ${runtime.historyUrl}`);
  if (runtime.mcpHttp) console.log(`  MCP HTTP:  http://127.0.0.1:${runtime.mcpPort}`);
  console.log(color('  Press Ctrl+C to stop every process.\n', 'gray'));
}

async function openUrl(url) {
  const command = process.env.ComSpec || 'cmd.exe';
  const child = spawn(command, ['/d', '/s', '/c', 'start', '', url], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore'
  });
  child.unref();
}

async function runWindowsStack(argv) {
  const args = parseCliArgs(argv);
  const envFile = path.resolve(projectRoot, args['env-file'] || '.env');
  const env = await loadEnvironment(envFile);
  const runtime = resolveRuntime(args, env, projectRoot);
  runtime.envFile = envFile;

  if (!existsSync(path.join(runtime.cwd, 'node_modules'))) throw new Error('node_modules is missing. Run npm install first.');
  if (runtime.command === 'host' && !runtime.skipBuild) {
    await runInvocation('Building production frontend', createToolInvocation('vite', ['build'], runtime.cwd), runtime);
  }

  const plan = createWindowsServicePlan(runtime);
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
    for (const child of [...children].reverse()) stopChild(child);
    await new Promise((resolve) => setTimeout(resolve, 500));
    for (const child of children) stopChild(child, 'SIGKILL');
    finish(code);
  };
  const onExit = (child, code, signal, error) => {
    if (stopping) return;
    const detail = error ? error.message : (signal || code || 0);
    console.error(color(`${child.__label} exited unexpectedly (${detail})`, 'red'));
    shutdown(code || 1);
  };
  process.once('SIGINT', () => shutdown(0));
  process.once('SIGTERM', () => shutdown(0));

  try {
    for (const service of plan) {
      console.log(color(`Starting ${service.label}…`, 'cyan'));
      const child = spawnInvocation(service.invocation, { cwd: runtime.cwd, env: runtime.serviceEnv, label: service.label, onExit });
      children.push(child);
      const state = await waitFor(service.healthUrl, child, service.key === 'web' ? 45_000 : 30_000);
      console.log(`${color('✓', 'green')} ${service.label} reachable${state.status >= 400 ? ` (HTTP ${state.status}, degraded/locked may be expected before sync)` : ''}`);
    }
    printUrls(runtime);
    if (runtime.open && runtime.command === 'host') await openUrl(runtime.appUrl).catch(() => {});
    process.exitCode = await done;
  } catch (error) {
    await shutdown(1);
    throw error;
  }
}

async function readPipedPrompt() {
  if (process.stdin.isTTY) return '';
  let text = '';
  for await (const chunk of process.stdin) text += chunk.toString();
  return text.trim();
}

async function startTerminalServices({ env, gatewayUrl, gatewayPort, knowledgePort, noSync }) {
  const children = [];
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
  const knowledgeUrl = `http://127.0.0.1:${knowledgePort}/health`;
  const gatewayHealthUrl = `${gatewayUrl}/api/health`;

  if (!(await reachable(knowledgeUrl)).reachable) {
    process.stderr.write('Starting local knowledge plane…\n');
    const child = spawnInvocation(createServiceInvocation('knowledge', projectRoot), { cwd: projectRoot, env: serviceEnv, label: 'knowledge' });
    children.push(child);
    await waitFor(knowledgeUrl, child);
  }
  if (!(await reachable(gatewayHealthUrl)).reachable) {
    process.stderr.write('Starting local chat gateway…\n');
    const child = spawnInvocation(createServiceInvocation('gateway', projectRoot), { cwd: projectRoot, env: serviceEnv, label: 'gateway' });
    children.push(child);
    await waitFor(gatewayHealthUrl, child);
  }

  return async () => {
    for (const child of [...children].reverse()) stopChild(child);
    if (children.length) await new Promise((resolve) => setTimeout(resolve, 400));
    for (const child of children) stopChild(child, 'SIGKILL');
  };
}

async function runWindowsTerminal(argv) {
  const args = parseTerminalArgs(argv);
  if (args.command === 'help') return printUnifiedHelp();
  const envFile = path.resolve(projectRoot, args['env-file'] || '.env');
  const env = await loadEnvironment(envFile);
  const gatewayPort = Number(args['gateway-port'] || env.PORT || 8787);
  const knowledgePort = Number(args['knowledge-port'] || env.KNOWLEDGE_PLANE_PORT || 8790);
  if (!Number.isInteger(gatewayPort) || !Number.isInteger(knowledgePort)) throw new Error('Gateway and knowledge ports must be integers');
  const explicitGateway = args['gateway-url'] || env.PMAI_GATEWAY_URL;
  const gatewayUrl = String(explicitGateway || `http://127.0.0.1:${gatewayPort}`).replace(/\/+$/, '');
  const initialPrompt = args.initialPrompt || await readPipedPrompt();
  const interactive = args.command === 'chat' && Boolean(process.stdin.isTTY);
  if (args.command === 'ask' && !initialPrompt) throw new Error('A question is required');
  if (!interactive && !initialPrompt) throw new Error('No prompt received. Run pmai in a terminal or pass a question.');
  if (!existsSync(path.join(projectRoot, 'node_modules'))) throw new Error('node_modules is missing. Run npm install first.');

  let cleanup = async () => {};
  const localGateway = !explicitGateway && /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(gatewayUrl);
  if (!(await reachable(`${gatewayUrl}/api/health`)).reachable && !args['no-start'] && localGateway) {
    cleanup = await startTerminalServices({ env, gatewayUrl, gatewayPort, knowledgePort, noSync: Boolean(args['no-sync']) });
  }

  try {
    return await runTerminalChat({
      gatewayUrl,
      token: args['session-token'] || env.PMAI_SESSION_TOKEN || '',
      locale: args.locale || env.PMAI_LOCALE || 'auto',
      color: !args['no-color'],
      json: Boolean(args.json),
      initialPrompt,
      interactive
    });
  } finally {
    await cleanup();
  }
}

export async function runWindowsCli(argv = process.argv.slice(2)) {
  if (argv[0] === 'help' || argv.includes('--help') || argv.includes('-h')) return printUnifiedHelp();
  if (['dev', 'host'].includes(argv[0])) return runWindowsStack(argv);
  if (processCommands.has(argv[0])) return runCli(argv);
  return runWindowsTerminal(argv);
}
