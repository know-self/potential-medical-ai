import { config } from '../server/config.js';
import { connectorRegistry, runConnectors } from '../server/connectors/index.js';
import { KnowledgeStore } from '../server/knowledge/store.js';
import { resolveEvidenceConflicts } from './conflicts.js';
import { ClinicalGovernance } from './governance.js';
import {
  createIncident,
  getMetrics,
  incrementMetric,
  initializeObservability,
  listIncidents,
  observeTiming,
  prometheusMetrics,
  setGauge,
  updateIncident
} from './observability.js';
import {
  approveSourceRegistryEntry,
  getSourceRegistryEntry,
  initializeSourceRegistry,
  listSourceRegistry,
  updateSourceRegistryEntry
} from './sourceRegistry.js';
import { localeRoutingPreference, resolveSnomedTerm, resolveTerminology } from './terminology.js';

const DEFAULT_SOURCE_MAX_AGE_MINUTES = {
  pubmed: 24 * 60,
  'clinicaltrials.gov': 36 * 60,
  'openfda-drug-enforcement': 6 * 60,
  'cdc-content-services': 12 * 60,
  dailymed: 24 * 60,
  'who-icd-11': 31 * 24 * 60,
  'who-guidelines': 24 * 60,
  'nice-guidelines': 24 * 60,
  'vietnam-moh': 12 * 60
};

const store = new KnowledgeStore({
  knowledgeFile: config.knowledgeFile,
  sourceStateFile: config.sourceStateFile
});
const governance = new ClinicalGovernance(store);

let initialization = null;
let syncInFlight = null;

function sourceMaxAgeMinutes(source) {
  return config.knowledgeSourceMaxAgeMinutes[source]
    || DEFAULT_SOURCE_MAX_AGE_MINUTES[source]
    || config.knowledgeDefaultMaxAgeMinutes;
}

export function evaluateFreshness(status, now = Date.now()) {
  const requiredSources = config.requiredKnowledgeSources;
  const sourceNames = new Set([
    ...Object.keys(status.sourceState || {}),
    ...requiredSources
  ]);

  const sources = {};
  let requiredStale = false;
  let anyDegraded = false;

  for (const source of sourceNames) {
    const state = status.sourceState?.[source] || null;
    const completedAt = state?.completedAt || null;
    const ageMinutes = completedAt ? Math.max(0, (now - Date.parse(completedAt)) / 60000) : null;
    const maxAgeMinutes = sourceMaxAgeMinutes(source);
    const isFresh = state?.status === 'ok' && ageMinutes !== null && ageMinutes <= maxAgeMinutes;
    const required = requiredSources.includes(source);

    if (!isFresh) {
      anyDegraded = true;
      if (required) requiredStale = true;
    }

    sources[source] = {
      required,
      status: state?.status || 'never-synced',
      completedAt,
      ageMinutes: ageMinutes === null ? null : Math.round(ageMinutes),
      maxAgeMinutes,
      fresh: isFresh,
      error: state?.error || null
    };
  }

  return {
    level: requiredStale ? 'stale' : anyDegraded ? 'degraded' : 'fresh',
    usable: !requiredStale || !config.knowledgeFailClosed,
    failClosed: config.knowledgeFailClosed,
    checkedAt: new Date(now).toISOString(),
    sources
  };
}

export async function initializeKnowledgePlane() {
  if (!initialization) {
    initialization = Promise.all([
      store.initialize(),
      initializeSourceRegistry(),
      initializeObservability()
    ]).then(() => governance.initialize());
  }
  await initialization;
  return getKnowledgeStatus();
}

export function getKnowledgeStatus() {
  const status = store.getStatus();
  const freshness = evaluateFreshness(status);
  const queue = governance.getQueue();
  const oldestReviewAgeHours = queue.length
    ? Math.max(...queue.map((item) => (Date.now() - Date.parse(item.retrievedAt || Date.now())) / 3600000))
    : 0;
  void setGauge('medical_review_queue_size', queue.length);
  void setGauge('medical_review_oldest_age_hours', Math.round(oldestReviewAgeHours));
  void setGauge('medical_freshness_usable', freshness.usable ? 1 : 0);
  return {
    ...status,
    availableConnectors: Object.keys(connectorRegistry),
    freshness,
    clinicalReviewQueue: queue.map(({ versionHistory, content, abstract, ...item }) => item),
    governance: {
      approvalsRequired: config.governance.approvalsRequired,
      queueSize: queue.length,
      oldestReviewAgeHours: Math.round(oldestReviewAgeHours)
    },
    sourceRegistry: {
      count: listSourceRegistry().count,
      validated: listSourceRegistry().entries.filter((item) => item.approval).length
    }
  };
}

function rankJurisdiction(results, routing) {
  const order = [routing.preferredJurisdiction, ...routing.fallbackJurisdictions];
  return [...results].sort((left, right) => {
    const leftRank = order.indexOf(left.jurisdiction);
    const rightRank = order.indexOf(right.jurisdiction);
    const normalizedLeft = leftRank < 0 ? order.length : leftRank;
    const normalizedRight = rightRank < 0 ? order.length : rightRank;
    return normalizedLeft - normalizedRight || (right.score || 0) - (left.score || 0);
  });
}

export function searchKnowledge(query, options = {}) {
  const started = Date.now();
  const status = getKnowledgeStatus();
  if (!status.freshness.usable) {
    void incrementMetric('medical_knowledge_search_blocked_total', { reason: 'stale' });
    const error = new Error('Required medical sources are stale or have never synchronized');
    error.code = 'KNOWLEDGE_STALE';
    error.statusCode = 503;
    error.freshness = status.freshness;
    throw error;
  }

  const terminology = resolveTerminology(query, { locale: options.locale || 'auto' });
  const routing = localeRoutingPreference(query, options.locale || 'auto');
  const result = store.search(query, options);
  const includeClinicalReview = options.includeClinicalReview === true;
  const approved = result.results.filter((document) => (
    includeClinicalReview || !['clinical-review-required', 'rejected'].includes(document.reviewStatus)
  ));
  const results = rankJurisdiction(approved, routing);
  const conflicts = resolveEvidenceConflicts(results);
  void incrementMetric('medical_knowledge_search_total', { locale: routing.locale });
  void observeTiming('medical_knowledge_search', Date.now() - started, { locale: routing.locale });

  return {
    ...result,
    results,
    conflicts,
    terminology,
    localeRouting: routing,
    freshness: status.freshness,
    knowledgeUpdatedAt: status.updatedAt
  };
}

export function listDiseases() {
  return store.listDiseases();
}

export function getDisease(id) {
  return store.getDisease(id);
}

export async function synchronizeKnowledge(sources) {
  if (syncInFlight) return syncInFlight;
  const started = Date.now();
  syncInFlight = runConnectors({ store, sources })
    .then(async (result) => {
      await incrementMetric('medical_sync_runs_total', { status: 'completed' });
      for (const source of result.sources || []) {
        await incrementMetric('medical_sync_source_total', { source: source.source, status: source.status });
      }
      await observeTiming('medical_sync_run', Date.now() - started);
      return result;
    })
    .catch(async (error) => {
      await incrementMetric('medical_sync_runs_total', { status: 'failed' });
      await createIncident({
        title: 'Knowledge synchronization failed',
        severity: 'warning',
        description: error.message,
        actor: 'scheduler'
      });
      throw error;
    })
    .finally(() => {
      syncInFlight = null;
    });
  return syncInFlight;
}

export const clinicalGovernance = {
  queue: () => governance.getQueue(),
  review: (id) => governance.getReview(id),
  decide: (id, input) => governance.decide(id, input),
  rollback: (id, input) => governance.rollback(id, input),
  audit: (options) => governance.readAudit(options)
};

export const sourceRegistry = {
  list: listSourceRegistry,
  get: getSourceRegistryEntry,
  update: updateSourceRegistryEntry,
  approve: approveSourceRegistryEntry
};

export const observability = {
  metrics: getMetrics,
  prometheus: prometheusMetrics,
  incidents: listIncidents,
  createIncident,
  updateIncident
};

export { resolveSnomedTerm, resolveTerminology };
