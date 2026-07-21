import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanFromEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === 'true';
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

const dataDir = process.env.MEDICAL_DATA_DIR || path.join(here, 'data');

export const config = {
  port: numberFromEnv('PORT', 8787),
  host: process.env.HOST || '0.0.0.0',
  allowedOrigins: listFromEnv('ALLOWED_ORIGINS', ['http://localhost:3000']),
  apiAdminToken: process.env.API_ADMIN_TOKEN || '',
  reviewerToken: process.env.CLINICAL_REVIEWER_TOKEN || process.env.API_ADMIN_TOKEN || '',
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

  dataDir,
  knowledgeFile: process.env.MEDICAL_KNOWLEDGE_FILE || path.join(dataDir, 'knowledge.json'),
  sourceStateFile: process.env.MEDICAL_SOURCE_STATE_FILE || path.join(dataDir, 'source-state.json'),
  reviewStateFile: process.env.CLINICAL_REVIEW_STATE_FILE || path.join(dataDir, 'clinical-review.json'),
  governanceAuditFile: process.env.GOVERNANCE_AUDIT_FILE || path.join(dataDir, 'governance-audit.jsonl'),
  sourceRegistryFile: process.env.SOURCE_REGISTRY_FILE || path.join(dataDir, 'source-registry.json'),
  incidentFile: process.env.INCIDENT_FILE || path.join(dataDir, 'incidents.json'),
  metricsFile: process.env.METRICS_FILE || path.join(dataDir, 'metrics.json'),
  userDataFile: process.env.USER_DATA_FILE || path.join(dataDir, 'user-data.enc.json'),
  userAuthFile: process.env.USER_AUTH_FILE || path.join(dataDir, 'user-auth.enc.json'),
  privacyAuditFile: process.env.PRIVACY_AUDIT_FILE || path.join(dataDir, 'privacy-audit.jsonl'),
  shareDataFile: process.env.SHARE_DATA_FILE || path.join(dataDir, 'shares.enc.json'),
  uploadDirectory: process.env.UPLOAD_DIRECTORY || path.join(dataDir, 'uploads'),
  uploadMetadataFile: process.env.UPLOAD_METADATA_FILE || path.join(dataDir, 'uploads.enc.json'),

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

  governance: {
    approvalsRequired: numberFromEnv('CLINICAL_APPROVALS_REQUIRED', 2),
    reviewMaxAgeHours: numberFromEnv('CLINICAL_REVIEW_MAX_AGE_HOURS', 72)
  },
  privacy: {
    signingKey: process.env.USER_SESSION_SIGNING_KEY || '',
    encryptionKey: process.env.USER_DATA_ENCRYPTION_KEY || '',
    bootstrapToken: process.env.USER_BOOTSTRAP_TOKEN || '',
    sessionHours: numberFromEnv('USER_SESSION_HOURS', 12),
    retentionDays: numberFromEnv('USER_DATA_RETENTION_DAYS', 90)
  },
  sharing: {
    defaultExpiryMinutes: numberFromEnv('SHARE_DEFAULT_EXPIRY_MINUTES', 60),
    maxExpiryMinutes: numberFromEnv('SHARE_MAX_EXPIRY_MINUTES', 10080)
  },
  uploads: {
    maxBytes: numberFromEnv('UPLOAD_MAX_BYTES', 10 * 1024 * 1024),
    allowedMimeTypes: listFromEnv('UPLOAD_ALLOWED_MIME_TYPES', [
      'text/plain',
      'application/json',
      'application/pdf',
      'image/png',
      'image/jpeg'
    ]),
    requireMalwareScan: booleanFromEnv('UPLOAD_REQUIRE_MALWARE_SCAN', false),
    malwareScannerUrl: process.env.MALWARE_SCANNER_URL || '',
    extractorUrl: process.env.DOCUMENT_EXTRACTOR_URL || '',
    retentionDays: numberFromEnv('UPLOAD_RETENTION_DAYS', 30),
    medicalImageAnalysisEnabled: booleanFromEnv('MEDICAL_IMAGE_ANALYSIS_ENABLED', false)
  },
  mcpHttp: {
    enabled: booleanFromEnv('MCP_HTTP_ENABLED', false),
    port: numberFromEnv('MCP_HTTP_PORT', 8791),
    host: process.env.MCP_HTTP_HOST || '127.0.0.1',
    allowedHosts: listFromEnv('MCP_HTTP_ALLOWED_HOSTS', ['127.0.0.1', 'localhost']),
    bearerToken: process.env.MCP_HTTP_BEARER_TOKEN || '',
    syncBearerToken: process.env.MCP_HTTP_SYNC_BEARER_TOKEN || '',
    allowSync: booleanFromEnv('MCP_HTTP_ALLOW_SYNC', false)
  },
  capacity: {
    tenantRequestsPerHour: numberFromEnv('TENANT_REQUESTS_PER_HOUR', 120),
    tenantCharactersPerDay: numberFromEnv('TENANT_CHARACTERS_PER_DAY', 500000),
    cacheTtlMinutes: numberFromEnv('MODEL_CACHE_TTL_MINUTES', 30),
    circuitFailureThreshold: numberFromEnv('MODEL_CIRCUIT_FAILURE_THRESHOLD', 3),
    circuitResetSeconds: numberFromEnv('MODEL_CIRCUIT_RESET_SECONDS', 60)
  },
  customModel: {
    allowedHosts: listFromEnv('CUSTOM_MODEL_ALLOWED_HOSTS'),
    allowPrivateNetwork: booleanFromEnv('CUSTOM_MODEL_ALLOW_PRIVATE_NETWORK', false),
    maxMessageCharacters: numberFromEnv('CUSTOM_MODEL_MAX_MESSAGE_CHARACTERS', 40000),
    maxOutputTokens: numberFromEnv('CUSTOM_MODEL_MAX_OUTPUT_TOKENS', 32768)
  },
  // Transitional empty values keep older health consumers readable. No provider credentials are loaded or used.
  openRouter: { apiKey: '' },
  google: { apiKey: '' },

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
  snomed: {
    baseUrl: String(process.env.SNOMED_FHIR_BASE_URL || '').replace(/\/$/, ''),
    bearerToken: process.env.SNOMED_BEARER_TOKEN || ''
  },
  icd: {
    clientId: process.env.WHO_ICD_CLIENT_ID || '',
    clientSecret: process.env.WHO_ICD_CLIENT_SECRET || '',
    release: process.env.WHO_ICD_RELEASE || '2026-01',
    language: process.env.WHO_ICD_LANGUAGE || 'en'
  }
};
