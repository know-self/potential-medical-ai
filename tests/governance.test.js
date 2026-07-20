import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { config } from '../server/config.js';
import { ClinicalGovernance } from '../knowledge-plane/governance.js';

async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'medical-governance-'));
  config.reviewStateFile = path.join(directory, 'review.json');
  config.governanceAuditFile = path.join(directory, 'audit.jsonl');
  config.knowledgeFile = path.join(directory, 'knowledge.json');
  config.governance.approvalsRequired = 2;
  const store = {
    documents: [{
      id: 'doc-1', source: 'official', title: 'Candidate', content: 'new warning', abstract: '',
      reviewStatus: 'clinical-review-required', changeType: 'high-risk-clinical-change',
      contentHash: 'new-hash', retrievedAt: new Date().toISOString(), metadata: {},
      versionHistory: [{ contentHash: 'old-hash', title: 'Previous', content: 'old content', abstract: '', sourceVersion: '1', publishedAt: null, updatedAt: null }]
    }]
  };
  const governance = new ClinicalGovernance(store);
  await governance.initialize();
  return { governance, store };
}

test('high-risk changes require two distinct approvals', async () => {
  const { governance, store } = await fixture();
  await governance.decide('doc-1', { decision: 'approve', reviewer: 'reviewer-a', reason: 'checked' });
  assert.equal(store.documents[0].reviewStatus, 'clinical-review-required');
  await governance.decide('doc-1', { decision: 'approve', reviewer: 'reviewer-b', reason: 'checked again' });
  assert.equal(store.documents[0].reviewStatus, 'approved');
  const audit = await governance.readAudit();
  assert.equal(audit.length, 2);
  assert.equal(audit[0].previousHash, audit[1].hash);
});

test('rollback restores the previous version', async () => {
  const { governance, store } = await fixture();
  await governance.rollback('doc-1', { reviewer: 'reviewer-a', reason: 'unsafe update' });
  assert.equal(store.documents[0].title, 'Previous');
  assert.equal(store.documents[0].contentHash, 'old-hash');
  assert.equal(store.documents[0].changeType, 'rollback');
});
