import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGatewaySseBuffer } from '../src/services/apiClient.js';

test('browser SSE parser supports CRLF and multiple data lines', () => {
  const parsed = parseGatewaySseBuffer(
    'event: chunk\r\ndata: {"type":"chunk",\r\ndata: "text":"hello"}\r\n\r\n'
  );
  assert.equal(parsed.rest, '');
  assert.deepEqual(parsed.events, [{ type: 'chunk', text: 'hello' }]);
});

test('browser SSE parser flushes a final event without trailing separator', () => {
  const parsed = parseGatewaySseBuffer('data: {"type":"done","mode":"direct"}', { final: true });
  assert.equal(parsed.rest, '');
  assert.deepEqual(parsed.events, [{ type: 'done', mode: 'direct' }]);
});

test('browser SSE parser preserves incomplete data until the next chunk', () => {
  const first = parseGatewaySseBuffer('data: {"type":"chunk"');
  assert.equal(first.events.length, 0);
  assert.match(first.rest, /chunk/);
  const second = parseGatewaySseBuffer(`${first.rest},"text":"ok"}\n\n`);
  assert.deepEqual(second.events, [{ type: 'chunk', text: 'ok' }]);
});
