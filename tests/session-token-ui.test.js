import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const panelPath = new URL('../src/components/AssistantControlPanel.jsx', import.meta.url);

test('secure session input remains a local draft until explicit verification', async () => {
  const source = await fs.readFile(panelPath, 'utf8');
  assert.match(source, /value=\{tokenDraft\}/);
  assert.match(source, /onChange=\{\(event\) => setTokenDraft\(event\.target\.value\)\}/);
  assert.match(source, />Verify and use<\/button>/);
  assert.doesNotMatch(source, /onChange=\{\(event\) => onTokenChange\(event\.target\.value\)\}/);
});
