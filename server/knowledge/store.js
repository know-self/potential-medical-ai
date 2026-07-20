import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { diseaseCatalog, diseaseToDocument } from './diseaseCatalog.js';

const HIGH_RISK_TERMS = [
  'dose', 'dosage', 'contraindication', 'contraindicated', 'pregnancy', 'pediatric',
  'renal impairment', 'hepatic impairment', 'black box', 'boxed warning', 'mortality',
  'emergency', 'anaphylaxis', 'overdose', 'liều', 'chống chỉ định', 'thai kỳ',
  'suy thận', 'suy gan', 'cảnh báo', 'tử vong', 'cấp cứu'
];

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, (char) => (char === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEARCH_STOPWORDS = new Set(['the', 'and', 'or', 'with', 'about', 'what', 'have', 'has', 'for', 'from', 'toi', 'bi', 'benh', 'man', 'la', 'va', 'co', 'cua', 'nhung']);

function tokenize(value = '') {
  return [...new Set(normalizeText(value).split(' ').filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token)))];
}

function documentHash(document) {
  const stable = JSON.stringify({
    title: document.title || '',
    content: document.content || '',
    sourceVersion: document.sourceVersion || '',
    canonicalUrl: document.canonicalUrl || ''
  });
  return crypto.createHash('sha256').update(stable).digest('hex');
}

function classifyChange(previous, current) {
  if (!previous) return 'new-document';
  const previousText = normalizeText(`${previous.title} ${previous.content}`);
  const currentText = normalizeText(`${current.title} ${current.content}`);
  const changedHighRiskTerm = HIGH_RISK_TERMS.some((term) => {
    const normalized = normalizeText(term);
    return previousText.includes(normalized) !== currentText.includes(normalized) || currentText.includes(normalized);
  });
  return changedHighRiskTerm ? 'high-risk-clinical-change' : 'content-update';
}

function normalizeDocument(input) {
  if (!input?.id || !input?.source || !input?.title) {
    throw new Error('Knowledge document requires id, source, and title');
  }

  const retrievedAt = input.retrievedAt || new Date().toISOString();
  return {
    id: String(input.id),
    source: String(input.source),
    sourceType: input.sourceType || 'external',
    title: String(input.title),
    content: String(input.content || '').trim(),
    abstract: String(input.abstract || '').trim(),
    aliases: Array.isArray(input.aliases) ? input.aliases.filter(Boolean) : [],
    diseaseIds: Array.isArray(input.diseaseIds) ? input.diseaseIds.filter(Boolean) : [],
    category: input.category || 'general',
    evidenceTier: Number.isFinite(Number(input.evidenceTier)) ? Number(input.evidenceTier) : 3,
    reviewStatus: input.reviewStatus || 'evidence-candidate',
    jurisdiction: input.jurisdiction || 'global',
    sourceVersion: input.sourceVersion || null,
    publishedAt: input.publishedAt || null,
    updatedAt: input.updatedAt || input.publishedAt || null,
    retrievedAt,
    canonicalUrl: input.canonicalUrl || null,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  };
}

function safeDateValue(value) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export class KnowledgeStore {
  constructor({ knowledgeFile, sourceStateFile }) {
    this.knowledgeFile = knowledgeFile;
    this.sourceStateFile = sourceStateFile;
    this.documents = [];
    this.sourceState = {};
    this.initialized = false;
  }

  async initialize() {
    await fs.mkdir(path.dirname(this.knowledgeFile), { recursive: true });
    await fs.mkdir(path.dirname(this.sourceStateFile), { recursive: true });

    this.documents = await this.#readJson(this.knowledgeFile, []);
    this.sourceState = await this.#readJson(this.sourceStateFile, {});

    if (this.documents.length === 0) {
      this.documents = diseaseCatalog.map((item) => {
        const document = normalizeDocument(diseaseToDocument(item));
        return {
          ...document,
          contentHash: documentHash(document),
          changeType: 'curated-baseline',
          previousVersionHash: null,
          versionHistory: []
        };
      });
      await this.#saveDocuments();
    }

    this.initialized = true;
    return this.getStatus();
  }

  async #readJson(file, fallback) {
    try {
      const text = await fs.readFile(file, 'utf8');
      return JSON.parse(text);
    } catch (error) {
      if (error.code === 'ENOENT') return fallback;
      throw error;
    }
  }

  async #writeJson(file, value) {
    const temporary = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  }

  async #saveDocuments() {
    await this.#writeJson(this.knowledgeFile, this.documents);
  }

  async #saveSourceState() {
    await this.#writeJson(this.sourceStateFile, this.sourceState);
  }

  async upsertMany(inputs = []) {
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    const indexById = new Map(this.documents.map((document, index) => [document.id, index]));

    for (const input of inputs) {
      const next = normalizeDocument(input);
      const nextHash = documentHash(next);
      const index = indexById.get(next.id);

      if (index === undefined) {
        this.documents.push({
          ...next,
          contentHash: nextHash,
          changeType: 'new-document',
          previousVersionHash: null,
          versionHistory: []
        });
        indexById.set(next.id, this.documents.length - 1);
        inserted += 1;
        continue;
      }

      const previous = this.documents[index];
      if (previous.contentHash === nextHash) {
        this.documents[index] = { ...previous, retrievedAt: next.retrievedAt, metadata: { ...previous.metadata, ...next.metadata } };
        unchanged += 1;
        continue;
      }

      const historyEntry = {
        contentHash: previous.contentHash,
        sourceVersion: previous.sourceVersion,
        title: previous.title,
        content: previous.content,
        abstract: previous.abstract,
        publishedAt: previous.publishedAt,
        updatedAt: previous.updatedAt,
        retrievedAt: previous.retrievedAt,
        archivedAt: new Date().toISOString()
      };

      this.documents[index] = {
        ...next,
        contentHash: nextHash,
        changeType: classifyChange(previous, next),
        previousVersionHash: previous.contentHash,
        reviewStatus: classifyChange(previous, next) === 'high-risk-clinical-change'
          ? 'clinical-review-required'
          : next.reviewStatus,
        versionHistory: [historyEntry, ...(previous.versionHistory || [])].slice(0, 10)
      };
      updated += 1;
    }

    if (inserted || updated || unchanged) await this.#saveDocuments();
    return { inserted, updated, unchanged };
  }

  detectDiseases(query) {
    const normalizedQuery = normalizeText(query);
    if (!normalizedQuery) return [];
    const paddedQuery = ` ${normalizedQuery} `;
    const queryTokens = new Set(normalizedQuery.split(' '));

    return diseaseCatalog
      .map((item) => {
        const matchedAliases = item.aliases.filter((alias) => {
          const normalizedAlias = normalizeText(alias);
          if (!normalizedAlias) return false;
          if (normalizedAlias.length <= 2) return queryTokens.has(normalizedAlias);
          return paddedQuery.includes(` ${normalizedAlias} `);
        });
        return matchedAliases.length ? { ...item, matchedAliases } : null;
      })
      .filter(Boolean);
  }

  search(query, { limit = 8, sources = [], maxEvidenceTier = 4 } = {}) {
    const queryTokens = tokenize(query);
    const normalizedQuery = normalizeText(query);
    const detectedDiseases = this.detectDiseases(query);
    const detectedIds = new Set(detectedDiseases.map((item) => item.id));
    const sourceSet = new Set(Array.isArray(sources) ? sources.filter(Boolean) : []);

    const results = this.documents
      .filter((document) => sourceSet.size === 0 || sourceSet.has(document.source))
      .filter((document) => document.evidenceTier <= maxEvidenceTier)
      .map((document) => {
        const title = normalizeText(document.title);
        const content = normalizeText(`${document.abstract} ${document.content}`);
        const aliases = normalizeText((document.aliases || []).join(' '));
        const tokenMatches = queryTokens.reduce((score, token) => {
          if (title.includes(token)) score += 5;
          if (aliases.includes(token)) score += 4;
          if (content.includes(token)) score += 1;
          return score;
        }, 0);
        const exactTitleBoost = normalizedQuery && title.includes(normalizedQuery) ? 8 : 0;
        const diseaseBoost = (document.diseaseIds || []).some((id) => detectedIds.has(id)) ? 12 : 0;
        const relevanceScore = tokenMatches + exactTitleBoost + diseaseBoost;
        const evidenceBoost = Math.max(0, 5 - document.evidenceTier);
        const reviewBoost = ['approved', 'curated-baseline'].includes(document.reviewStatus) ? 3 : 0;
        const recencyBoost = safeDateValue(document.updatedAt || document.publishedAt) > Date.now() - 1000 * 60 * 60 * 24 * 365 ? 1 : 0;
        return { ...document, relevanceScore, score: relevanceScore + evidenceBoost + reviewBoost + recencyBoost };
      })
      .filter((document) => document.relevanceScore > 0 || queryTokens.length === 0)
      .sort((a, b) => b.score - a.score || safeDateValue(b.updatedAt || b.publishedAt) - safeDateValue(a.updatedAt || a.publishedAt))
      .slice(0, Math.min(Math.max(Number(limit) || 8, 1), 30))
      .map(({ versionHistory, ...document }) => document);

    return {
      query,
      detectedDiseases,
      results,
      generatedAt: new Date().toISOString()
    };
  }

  getDisease(id) {
    return diseaseCatalog.find((item) => item.id === id) || null;
  }

  listDiseases() {
    return diseaseCatalog;
  }

  getStatus() {
    const bySource = {};
    const reviewQueue = [];
    for (const document of this.documents) {
      bySource[document.source] = (bySource[document.source] || 0) + 1;
      if (document.reviewStatus === 'clinical-review-required') {
        reviewQueue.push({ id: document.id, source: document.source, title: document.title, changeType: document.changeType, retrievedAt: document.retrievedAt });
      }
    }
    return {
      initialized: this.initialized,
      totalDocuments: this.documents.length,
      diseaseProfiles: diseaseCatalog.length,
      bySource,
      clinicalReviewQueue: reviewQueue,
      sourceState: this.sourceState,
      updatedAt: this.documents.reduce((latest, document) => {
        const candidate = safeDateValue(document.retrievedAt);
        return candidate > safeDateValue(latest) ? document.retrievedAt : latest;
      }, null)
    };
  }

  async setSourceState(source, state) {
    this.sourceState[source] = { ...(this.sourceState[source] || {}), ...state, updatedAt: new Date().toISOString() };
    await this.#saveSourceState();
    return this.sourceState[source];
  }
}

export { normalizeText, classifyChange };
