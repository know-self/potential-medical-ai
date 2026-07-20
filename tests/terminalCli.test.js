import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSseBuffer, parseSlashCommand } from '../scripts/pmai-chat.js';
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
