import assert from 'node:assert/strict';
import test from 'node:test';
import { createServicePlan, parseCliArgs, parseDotEnv, resolveRuntime } from '../scripts/pmai-cli.js';

test('parseDotEnv handles exports, quotes, comments, and embedded equals', () => {
  assert.deepEqual(parseDotEnv(`
# comment
export PORT=8787
NAME="Potential Medical AI"
TOKEN=abc=123 # trailing comment
SINGLE='literal value'
`), {
    PORT: '8787',
    NAME: 'Potential Medical AI',
    TOKEN: 'abc=123',
    SINGLE: 'literal value'
  });
});

test('parseCliArgs supports commands, aliases, booleans, and inline values', () => {
  assert.deepEqual(parseCliArgs(['host', '-H', '0.0.0.0', '--public-host=192.168.1.5', '--mcp-http', '--skip-build']), {
    command: 'host',
    host: '0.0.0.0',
    'public-host': '192.168.1.5',
    'mcp-http': true,
    'skip-build': true
  });
});

test('resolveRuntime wires browser URLs and private service URLs consistently', () => {
  const runtime = resolveRuntime({
    command: 'host', host: '0.0.0.0', 'public-host': '192.168.1.5',
    'gateway-port': '9000', 'knowledge-port': '9001', 'history-port': '9002'
  }, { ALLOWED_ORIGINS: 'https://example.test' }, '/repo');
  assert.equal(runtime.appUrl, 'http://192.168.1.5:9000');
  assert.equal(runtime.historyUrl, 'http://192.168.1.5:9002');
  assert.equal(runtime.serviceEnv.KNOWLEDGE_PLANE_URL, 'http://127.0.0.1:9001');
  assert.equal(runtime.serviceEnv.VITE_MEDICAL_API_URL, '');
  assert.match(runtime.serviceEnv.ALLOWED_ORIGINS, /https:\/\/example\.test/);
});

test('service plan starts the complete dev stack and optional MCP', () => {
  const runtime = resolveRuntime({ command: 'dev', 'mcp-http': true }, {}, '/repo');
  assert.deepEqual(createServicePlan(runtime).map((item) => item.key), ['knowledge', 'history', 'gateway', 'mcp', 'web']);
});

test('service plan hosts production through gateway without Vite', () => {
  const runtime = resolveRuntime({ command: 'host' }, {}, '/repo');
  assert.deepEqual(createServicePlan(runtime).map((item) => item.key), ['knowledge', 'history', 'gateway']);
});
