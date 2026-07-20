import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServiceInvocation, createToolInvocation } from '../scripts/local-command.js';
import { createWindowsServicePlan } from '../scripts/pmai-windows-runtime.js';
import { resolveRuntime } from '../scripts/pmai-cli.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitFor(url, child, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`service exited with ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`timed out waiting for ${url}`);
}

test('local invocations execute JavaScript CLIs through the current Node binary', () => {
  const vite = createToolInvocation('vite', ['build'], root);
  const history = createToolInvocation('json-server', ['--watch', 'db.json'], root);
  const knowledge = createServiceInvocation('knowledge', root);

  assert.equal(vite.command, process.execPath);
  assert.equal(history.command, process.execPath);
  assert.equal(knowledge.command, process.execPath);
  assert.match(vite.args[0], /node_modules[\\/]vite[\\/]bin[\\/]vite\.js$/);
  assert.match(history.args[0], /node_modules[\\/]json-server[\\/]lib[\\/]cli[\\/]bin\.js$/);
  assert.match(knowledge.args[0], /scripts[\\/]service-bootstrap\.js$/);
  assert.equal(knowledge.args[1], 'knowledge');
  assert.equal(vite.command.endsWith('.cmd'), false);
});

test('Windows service plan avoids npm.cmd and preserves dependency order', () => {
  const runtime = resolveRuntime({ command: 'dev', 'mcp-http': true }, {}, root);
  const plan = createWindowsServicePlan(runtime);

  assert.deepEqual(plan.map((service) => service.key), ['knowledge', 'history', 'gateway', 'mcp', 'web']);
  assert.ok(plan.every((service) => service.invocation.command === process.execPath));
  assert.ok(plan.every((service) => !service.invocation.command.endsWith('.cmd')));
});

test('explicit knowledge bootstrap becomes reachable instead of exiting cleanly', { timeout: 30_000 }, async (t) => {
  const port = await freePort();
  const invocation = createServiceInvocation('knowledge', root);
  let output = '';
  const child = spawn(invocation.command, invocation.args, {
    cwd: root,
    env: {
      ...process.env,
      KNOWLEDGE_PLANE_PORT: String(port),
      KNOWLEDGE_PLANE_HOST: '127.0.0.1',
      KNOWLEDGE_ALLOWED_HOSTS: '127.0.0.1,localhost',
      SYNC_ENABLED: 'false',
      SYNC_ON_START: 'false',
      KNOWLEDGE_FAIL_CLOSED: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (chunk) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk) => { output += chunk.toString(); });

  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  });

  const response = await waitFor(`http://127.0.0.1:${port}/health`, child);
  assert.ok([200, 503].includes(response.status), output);
  assert.match(output, /Knowledge plane listening/);
});
