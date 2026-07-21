import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';
import { once } from 'node:events';
import { normalizeModelSettings as normalizeServerSettings, streamCustomModelChunks } from '../server/models.js';
import { supportedMimeType } from '../src/services/apiClient.js';

test('server normalizes generic OpenAI-compatible model settings', () => {
  const settings = normalizeServerSettings({
    endpoint: 'https://models.example.com/v1/?api-version=2026-01',
    model: 'medical-model',
    apiKey: 'secret',
    mode: 'document-rag',
    temperature: 9,
    maxTokens: 999999,
    headers: {
      'X-API-Version': '2026-01',
      Authorization: 'must-not-pass',
      Host: 'must-not-pass'
    }
  });
  assert.equal(settings.endpoint, 'https://models.example.com/v1/chat/completions?api-version=2026-01');
  assert.equal(settings.model, 'medical-model');
  assert.equal(settings.mode, 'document-rag');
  assert.equal(settings.temperature, 2);
  assert.equal(settings.maxTokens, 32768);
  assert.deepEqual(settings.headers, { 'x-api-version': '2026-01' });
});

test('browser upload MIME inference supports approved extensions with generic types', () => {
  assert.equal(supportedMimeType({ name: 'scan.JPEG', type: '' }), 'image/jpeg');
  assert.equal(supportedMimeType({ name: 'report.pdf', type: 'application/octet-stream' }), 'application/pdf');
  assert.equal(supportedMimeType({ name: 'notes.txt', type: '' }), 'text/plain');
});

test('custom model runtime streams an OpenAI-compatible response through loopback', async (t) => {
  let received = null;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      url: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    };
    response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8' });
    response.write('data: {"choices":[{"delta":{"content":"hello "}}]}\n\n');
    response.end('data: {"choices":[{"delta":{"content":"world"}}]}');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  const streamed = [];
  const result = await streamCustomModelChunks({
    settings: {
      endpoint: `http://127.0.0.1:${port}/v1?api-version=test`,
      endpointHost: 'untrusted-bypass-attempt',
      model: 'mock-model',
      apiKey: 'mock-key',
      mode: 'direct',
      headers: { Authorization: 'Bearer attacker-value' }
    },
    messages: [{ role: 'user', content: 'test' }]
  }, (chunk) => streamed.push(chunk));

  assert.equal(result.text, 'hello world');
  assert.deepEqual(streamed, ['hello ', 'world']);
  assert.equal(received.url, '/v1/chat/completions?api-version=test');
  assert.equal(received.authorization, 'Bearer mock-key');
  assert.equal(received.body.model, 'mock-model');
  assert.equal(received.body.stream, true);
});

test('provider-specific model secrets are removed from environment documentation', async () => {
  const env = await fs.readFile(new URL('../env.example', import.meta.url), 'utf8');
  assert.doesNotMatch(env, /OPENROUTER_API_KEY|GOOGLE_AI_API_KEY|OPENROUTER_MODEL|GOOGLE_AI_MODEL/);
  assert.match(env, /PMAI_MODEL_ENDPOINT/);
  assert.match(env, /CUSTOM_MODEL_ALLOWED_HOSTS/);
});
