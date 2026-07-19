import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AtomicJsonStore, appendJsonLine } from '../server/lib/atomicJsonStore.js';
import { config } from '../server/config.js';

function auditHash(entry) {
  return crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

async function lastAuditHash(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    const lines = text.trim().split('\n').filter(Boolean);
    if (!lines.length) return null;
    return JSON.parse(lines.at(-1)).hash || null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export class ClinicalGovernance {
  constructor(store) {
    this.store = store;
    this.reviewStore = new AtomicJsonStore(config.reviewStateFile, {
      reviews: {},
      updatedAt: null
    });
  }

  async initialize() {
    await this.reviewStore.initialize();
    return this.getQueue();
  }

  getQueue() {
    const state = this.reviewStore.snapshot();
    return this.store.documents.filter((item) => item.reviewStatus === 'clinical-review-required').map((item) => ({
      id: item.id,
      source: item.source,
      title: item.title,
      changeType: item.changeType,
      retrievedAt: item.retrievedAt,
      contentHash: item.contentHash,
      ...item,
      workflow: state.reviews[item.id] || {
        approvals: [],
        rejections: [],
        status: 'pending'
      }
    }));
  }

  getReview(id) {
    const document = structuredClone(this.store.documents.find((item) => item.id === id) || null);
    if (!document) return null;
    const workflow = this.reviewStore.snapshot().reviews[id] || {
      approvals: [],
      rejections: [],
      status: document.reviewStatus === 'clinical-review-required' ? 'pending' : document.reviewStatus
    };
    return { document, workflow };
  }

  async decide(id, { decision, reviewer, reason = '' }) {
    if (!['approve', 'reject'].includes(decision)) throw new Error('Decision must be approve or reject');
    if (!reviewer || String(reviewer).trim().length < 2) throw new Error('Reviewer identity is required');
    const document = structuredClone(this.store.documents.find((item) => item.id === id) || null);
    if (!document) throw new Error('Knowledge document not found');
    if (document.reviewStatus !== 'clinical-review-required' && decision === 'approve') {
      throw new Error('Document is not awaiting clinical review');
    }

    let workflow;
    await this.reviewStore.mutate((state) => {
      const current = state.reviews[id] || { approvals: [], rejections: [], status: 'pending' };
      current.approvals = current.approvals.filter((item) => item.reviewer !== reviewer);
      current.rejections = current.rejections.filter((item) => item.reviewer !== reviewer);
      const record = { reviewer, reason: String(reason).slice(0, 2000), timestamp: new Date().toISOString() };
      if (decision === 'approve') current.approvals.push(record);
      else current.rejections.push(record);
      current.status = current.rejections.length
        ? 'rejected'
        : current.approvals.length >= config.governance.approvalsRequired
          ? 'approved'
          : 'pending';
      current.updatedAt = record.timestamp;
      state.reviews[id] = current;
      state.updatedAt = record.timestamp;
      workflow = structuredClone(current);
    });

    if (workflow.status === 'approved') {
      await this.setReviewStatus(id, 'approved', { reviewers: workflow.approvals.map((item) => item.reviewer) });
    } else if (workflow.status === 'rejected') {
      await this.setReviewStatus(id, 'rejected', { reviewers: workflow.rejections.map((item) => item.reviewer) });
    }

    await this.appendAudit({
      action: `clinical-review-${decision}`,
      actor: reviewer,
      targetId: id,
      reason: String(reason).slice(0, 2000),
      workflowStatus: workflow.status,
      contentHash: document.contentHash
    });
    return this.getReview(id);
  }

  async rollback(id, { reviewer, reason = '' }) {
    if (!reviewer) throw new Error('Reviewer identity is required');
    const before = structuredClone(this.store.documents.find((item) => item.id === id) || null);
    if (!before) throw new Error('Knowledge document not found');
    const document = await this.rollbackStoredDocument(id);
    await this.reviewStore.mutate((state) => {
      state.reviews[id] = {
        approvals: [],
        rejections: [],
        status: 'rolled-back',
        updatedAt: new Date().toISOString(),
        actor: reviewer,
        reason: String(reason).slice(0, 2000)
      };
      state.updatedAt = new Date().toISOString();
    });
    await this.appendAudit({
      action: 'clinical-review-rollback',
      actor: reviewer,
      targetId: id,
      reason: String(reason).slice(0, 2000),
      previousHash: before.contentHash,
      restoredHash: document.contentHash
    });
    return this.getReview(id);
  }

  async persistDocuments() {
    await fs.mkdir(path.dirname(config.knowledgeFile), { recursive: true });
    const temporary = `${config.knowledgeFile}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(this.store.documents, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporary, config.knowledgeFile);
  }

  async setReviewStatus(id, status, metadata = {}) {
    const index = this.store.documents.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Knowledge document not found');
    this.store.documents[index] = {
      ...this.store.documents[index],
      reviewStatus: status,
      metadata: { ...this.store.documents[index].metadata, governance: metadata },
      reviewedAt: new Date().toISOString()
    };
    await this.persistDocuments();
    return structuredClone(this.store.documents[index]);
  }

  async rollbackStoredDocument(id) {
    const index = this.store.documents.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Knowledge document not found');
    const current = this.store.documents[index];
    const previous = current.versionHistory?.[0];
    if (!previous) throw new Error('No previous knowledge version is available');
    const remainingHistory = current.versionHistory.slice(1);
    this.store.documents[index] = {
      ...current,
      title: previous.title,
      content: previous.content,
      abstract: previous.abstract,
      sourceVersion: previous.sourceVersion,
      publishedAt: previous.publishedAt,
      updatedAt: previous.updatedAt,
      retrievedAt: new Date().toISOString(),
      contentHash: previous.contentHash,
      previousVersionHash: remainingHistory[0]?.contentHash || null,
      versionHistory: remainingHistory,
      reviewStatus: 'approved',
      changeType: 'rollback'
    };
    await this.persistDocuments();
    return structuredClone(this.store.documents[index]);
  }

  async appendAudit(payload) {
    const previousHash = await lastAuditHash(config.governanceAuditFile);
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      previousHash,
      ...payload
    };
    entry.hash = auditHash(entry);
    await appendJsonLine(config.governanceAuditFile, entry);
    return entry;
  }

  async readAudit({ limit = 200 } = {}) {
    try {
      const text = await fs.readFile(config.governanceAuditFile, 'utf8');
      return text.trim().split('\n').filter(Boolean).slice(-Math.min(Math.max(limit, 1), 1000)).reverse().map(JSON.parse);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }
}
