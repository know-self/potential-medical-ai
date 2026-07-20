import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { parseSseBuffer, parseSlashCommand, streamGatewayChat } from '../scripts/pmai-chat.js';
import { parseTerminalArgs, shouldRunProcessCommand } from '../scripts/pmai-terminal-cli.js';

test('bare pmai opens interactive chat', () => {
  assert.deepEqual(parseTerminalArgs([]), { command: 'chat', positionals: [] });
});

test('free-form arguments become a one-shot ask', () => {
  assert.deepEqual(parseTerminalArgs(['explain', 'heart', 'failure']), {
    command: 'ask',
    positionals: ['explain', 'heart', 'failure'],
    initialPrompt: 'explain heart failure'
  });
});

test('explicit chat can start with an initial prompt', () => {
  assert.deepEqual(parseTerminalArgs(['chat', 'hello', '--locale', 'vi']), {
    command: 'chat',
    positionals: ['hello'],
    locale: 'vi',
    initialPrompt: 'hello'
  });
});

test('process manager commands remain delegated', () => {
  assert.equal(shouldRunProcessCommand(['dev']), true);
  assert.equal(shouldRunProcessCommand(['host']), true);
  assert.equal(shouldRunProcessCommand(['ask']), false);
});

test('SSE parser preserves incomplete events', () => {
  const parsed = parseSseBuffer('data: {"type":"chunk","text":"a"}\n\ndata: {"type":"chunk"');
  assert.deepEqual(parsed.events, [{ type: 'chunk', text: 'a' }]);
  assert.equal(parsed.rest, 'data: {"type":"chunk"');
});

test('slash command parser preserves path arguments', () => {
  assert.deepEqual(parseSlashCommand('/attach ./medical files/report.pdf'), {
    name: 'attach',
    value: './medical files/report.pdf'
  });
  assert.equal(parseSlashCommand('normal prompt'), null);
});

test('terminal client streams gateway chunks and sends private context options', async () => {
  let received;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
    };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write('data: {"type":"chunk","text":"Hello "}\n\n');
    response.write('data: {"type":"chunk","text":"terminal"}\n\n');
    response.end('data: {"type":"done","freshness":{"level":"fresh"}}\n\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const streamed = [];
  try {
    const result = await streamGatewayChat({
      gatewayUrl: `http://127.0.0.1:${address.port}`,
      message: 'Hi',
      history: [{ role: 'user', content: 'Previous' }],
      token: 'private-token',
      locale: 'vi',
      attachmentIds: ['upload-1'],
      onChunk: (chunk) => streamed.push(chunk)
    });
    assert.equal(result.text, 'Hello terminal');
    assert.deepEqual(streamed, ['Hello ', 'terminal']);
    assert.equal(received.authorization, 'Bearer private-token');
    assert.equal(received.body.locale, 'vi');
    assert.deepEqual(received.body.attachmentIds, ['upload-1']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
