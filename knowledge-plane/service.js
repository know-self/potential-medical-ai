import { config } from '../server/config.js';
import { connectorRegistry, runConnectors } from '../server/connectors/index.js';
import { KnowledgeStore } from '../server/knowledge/store.js';

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
  if (!initialization) initialization = store.initialize();
  await initialization;
  return getKnowledgeStatus();
}

export function getKnowledgeStatus() {
  const status = store.getStatus();
  return {
    ...status,
    availableConnectors: Object.keys(connectorRegistry),
    freshness: evaluateFreshness(status)
  };
}

export function searchKnowledge(query, options = {}) {
  const status = getKnowledgeStatus();
  if (!status.freshness.usable) {
    const error = new Error('Required medical sources are stale or have never synchronized');
    error.code = 'KNOWLEDGE_STALE';
    error.statusCode = 503;
    error.freshness = status.freshness;
    throw error;
  }

  const result = store.search(query, options);
  const includeClinicalReview = options.includeClinicalReview === true;
  const results = result.results.filter((document) => (
    includeClinicalReview || document.reviewStatus !== 'clinical-review-required'
  ));

  return {
    ...result,
    results,
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
  syncInFlight = runConnectors({ store, sources }).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}
