import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { KnowledgeStore } from '../server/knowledge/store.js';
import { diseaseCatalog } from '../server/knowledge/diseaseCatalog.js';

async function createStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'medical-store-'));
  const store = new KnowledgeStore({
    knowledgeFile: path.join(dir, 'knowledge.json'),
    sourceStateFile: path.join(dir, 'source-state.json')
  });
  await store.initialize();
  return { store, dir };
}

test('disease catalog provides broad multidisciplinary coverage', () => {
  assert.ok(diseaseCatalog.length >= 35);
  assert.equal(new Set(diseaseCatalog.map((item) => item.id)).size, diseaseCatalog.length);
  const categories = new Set(diseaseCatalog.map((item) => item.category));
  for (const category of ['cardiovascular', 'endocrine', 'renal', 'respiratory', 'oncology', 'mental-health']) {
    assert.ok(categories.has(category));
  }
});

test('search detects Vietnamese conditions and prioritizes disease profiles', async () => {
  const { store } = await createStore();
  const result = store.search('Tôi bị đái tháo đường và bệnh thận mạn', { limit: 10 });
  const ids = result.detectedDiseases.map((item) => item.id);
  assert.ok(ids.includes('type-2-diabetes'));
  assert.ok(ids.includes('chronic-kidney-disease'));
  assert.ok(result.results.some((item) => item.id === 'disease:type-2-diabetes'));
});

test('upsert versions documents and classifies high-risk clinical changes', async () => {
  const { store } = await createStore();
  const base = {
    id: 'guideline:test',
    source: 'official-test',
    title: 'Test guideline',
    content: 'General monitoring guidance.',
    sourceVersion: '1',
    evidenceTier: 1,
    reviewStatus: 'approved'
  };
  assert.deepEqual(await store.upsertMany([base]), { inserted: 1, updated: 0, unchanged: 0 });
  assert.deepEqual(await store.upsertMany([base]), { inserted: 0, updated: 0, unchanged: 1 });
  const updated = { ...base, content: 'The dosage and contraindication section changed.', sourceVersion: '2' };
  assert.deepEqual(await store.upsertMany([updated]), { inserted: 0, updated: 1, unchanged: 0 });
  const result = store.search('dosage contraindication', { limit: 5 });
  const guideline = result.results.find((item) => item.id === 'guideline:test');
  assert.equal(guideline.changeType, 'high-risk-clinical-change');
  assert.ok(guideline.previousVersionHash);
});
