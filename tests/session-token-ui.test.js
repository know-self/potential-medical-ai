import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const panelPath = new URL('../src/components/AssistantControlPanel.jsx', import.meta.url);

test('account controls use email/password authentication instead of raw session tokens', async () => {
  const source = await fs.readFile(panelPath, 'utf8');
  assert.match(source, /type="email"/);
  assert.match(source, /placeholder="Password \(at least 12 characters\)"/);
  assert.match(source, />Sign in<\/button>/);
  assert.match(source, />Create account<\/button>/);
  assert.doesNotMatch(source, /placeholder="User session token"/);
});
