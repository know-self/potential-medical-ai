import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function listFromEnv(name, fallback = []) {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function jsonObjectFromEnv(name, fallback = {}) {
  const value = process.env[name];
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export const config = {
  port: numberFromEnv('PORT', 8787),
  host: process.env.HOST || '0.0.0.0',
  allowedOrigins: listFromEnv('ALLOWED_ORIGINS', ['http://localhost:3000']),
  apiAdminToken: process.env.API_ADMIN_TOKEN || '',
  requestTimeoutMs: numberFromEnv('UPSTREAM_TIMEOUT_MS', 20000),
  rateLimitWindowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', 60000),
  rateLimitMax: numberFromEnv('RATE_LIMIT_MAX', 80),

  knowledgePlaneUrl: String(process.env.KNOWLEDGE_PLANE_URL || 'http://127.0.0.1:8790').replace(/\/$/, ''),
  knowledgePlanePort: numberFromEnv('KNOWLEDGE_PLANE_PORT', 8790),
  knowledgePlaneHost: process.env.KNOWLEDGE_PLANE_HOST || '127.0.0.1',
  knowledgeAllowedHosts: listFromEnv('KNOWLEDGE_ALLOWED_HOSTS', ['127.0.0.1', 'localhost']),
  knowledgeRequestTimeoutMs: numberFromEnv('KNOWLEDGE_REQUEST_TIMEOUT_MS', 10000),
  knowledgeFailClosed: process.env.KNOWLEDGE_FAIL_CLOSED !== 'false',
  knowledgeDefaultMaxAgeMinutes: numberFromEnv('KNOWLEDGE_DEFAULT_MAX_AGE_MINUTES', 1440),
  knowledgeSourceMaxAgeMinutes: jsonObjectFromEnv('KNOWLEDGE_SOURCE_MAX_AGE_JSON'),
  requiredKnowledgeSources: listFromEnv('REQUIRED_KNOWLEDGE_SOURCES', [
    'pubmed',
    'clinicaltrials.gov',
    'openfda-drug-enforcement',
    'cdc-content-services'
  ]),

  dataDir: process.env.MEDICAL_DATA_DIR || path.join(here, 'data'),
  knowledgeFile: process.env.MEDICAL_KNOWLEDGE_FILE || path.join(here, 'data', 'knowledge.json'),
  sourceStateFile: process.env.MEDICAL_SOURCE_STATE_FILE || path.join(here, 'data', 'source-state.json'),
  syncOnStart: process.env.SYNC_ON_START === 'true',
  syncEnabled: process.env.SYNC_ENABLED !== 'false',
  syncIntervalMinutes: numberFromEnv('SYNC_INTERVAL_MINUTES', 360),
  syncTopics: listFromEnv('MEDICAL_SYNC_TOPICS', [
    'diabetes mellitus',
    'hypertension',
    'chronic kidney disease',
    'heart failure',
    'asthma',
    'chronic obstructive pulmonary disease',
    'stroke',
    'cancer',
    'depression',
    'infectious disease'
  ]),
  maxItemsPerSource: numberFromEnv('MAX_ITEMS_PER_SOURCE', 20),

  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'google/gemma-3-12b-it:free',
    appUrl: process.env.APP_PUBLIC_URL || 'http://localhost:3000',
    appName: process.env.APP_NAME || 'Potential Medical AI'
  },
  google: {
    apiKey: process.env.GOOGLE_AI_API_KEY || '',
    model: process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash-lite'
  },
  pubmed: {
    apiKey: process.env.NCBI_API_KEY || '',
    email: process.env.NCBI_EMAIL || '',
    tool: process.env.NCBI_TOOL || 'potential-medical-ai'
  },
  openFda: { apiKey: process.env.OPENFDA_API_KEY || '' },
  dailyMedSetIds: listFromEnv('DAILYMED_SET_IDS'),
  cdcTopics: listFromEnv('CDC_TOPICS', ['diabetes', 'heart disease', 'cancer', 'stroke']),
  feeds: {
    who: listFromEnv('WHO_FEED_URLS'),
    nice: listFromEnv('NICE_FEED_URLS'),
    vietnamMoh: listFromEnv('VIETNAM_MOH_FEED_URLS')
  },
  icd: {
    clientId: process.env.WHO_ICD_CLIENT_ID || '',
    clientSecret: process.env.WHO_ICD_CLIENT_SECRET || '',
    release: process.env.WHO_ICD_RELEASE || '2026-01',
    language: process.env.WHO_ICD_LANGUAGE || 'en'
  }
};
