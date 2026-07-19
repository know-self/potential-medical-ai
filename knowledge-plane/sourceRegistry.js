import { AtomicJsonStore } from '../server/lib/atomicJsonStore.js';
import { config } from '../server/config.js';

const BUILTIN_SOURCES = {
  pubmed: {
    name: 'PubMed',
    authorityType: 'bibliographic-index',
    jurisdiction: 'global',
    updateMode: 'api',
    guidanceEligible: false,
    defaultEvidenceTier: 2,
    licenseStatus: 'operator-validation-required',
    notes: 'Research discovery source; records are evidence candidates, not treatment guidance.'
  },
  'clinicaltrials.gov': {
    name: 'ClinicalTrials.gov',
    authorityType: 'trial-registry',
    jurisdiction: 'global',
    updateMode: 'api',
    guidanceEligible: false,
    defaultEvidenceTier: 3,
    licenseStatus: 'operator-validation-required',
    notes: 'Trial registrations do not establish clinical effectiveness.'
  },
  'openfda-drug-enforcement': {
    name: 'openFDA Drug Enforcement',
    authorityType: 'safety-alert',
    jurisdiction: 'United States',
    updateMode: 'api',
    guidanceEligible: true,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required'
  },
  'cdc-content-services': {
    name: 'CDC Content Services',
    authorityType: 'public-health-guidance',
    jurisdiction: 'United States',
    updateMode: 'api',
    guidanceEligible: true,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required'
  },
  dailymed: {
    name: 'DailyMed',
    authorityType: 'drug-label',
    jurisdiction: 'United States',
    updateMode: 'api',
    guidanceEligible: true,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required'
  },
  'snomed-ct': {
    name: 'SNOMED CT terminology server',
    authorityType: 'clinical-terminology',
    jurisdiction: 'configured-license-scope',
    updateMode: 'FHIR-terminology-server',
    guidanceEligible: false,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required',
    notes: 'Enable only with a licensed terminology service and validated deployment scope.'
  },
  'who-icd-11': {
    name: 'WHO ICD-11',
    authorityType: 'terminology',
    jurisdiction: 'global',
    updateMode: 'api-release',
    guidanceEligible: false,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required'
  },
  'who-guidelines': {
    name: 'WHO Guidelines',
    authorityType: 'guideline',
    jurisdiction: 'global',
    updateMode: 'official-feed',
    guidanceEligible: true,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required'
  },
  'nice-guidelines': {
    name: 'NICE Guidelines',
    authorityType: 'guideline',
    jurisdiction: 'United Kingdom',
    updateMode: 'official-feed',
    guidanceEligible: true,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required'
  },
  'vietnam-moh': {
    name: 'Vietnam Ministry of Health',
    authorityType: 'guideline',
    jurisdiction: 'Vietnam',
    updateMode: 'official-feed',
    guidanceEligible: true,
    defaultEvidenceTier: 1,
    licenseStatus: 'operator-validation-required'
  },
  'curated-disease-catalog': {
    name: 'Curated Disease Catalog',
    authorityType: 'internal-curated-baseline',
    jurisdiction: 'general',
    updateMode: 'code-release',
    guidanceEligible: false,
    defaultEvidenceTier: 1,
    licenseStatus: 'project-owned',
    notes: 'Terminology and navigation baseline only; not a treatment guideline.'
  }
};

const registryStore = new AtomicJsonStore(config.sourceRegistryFile, {
  schemaVersion: 1,
  overrides: {},
  approvals: {},
  updatedAt: null
});

export async function initializeSourceRegistry() {
  await registryStore.initialize();
  return listSourceRegistry();
}

export function listSourceRegistry() {
  const state = registryStore.snapshot();
  const entries = Object.entries(BUILTIN_SOURCES).map(([id, source]) => ({
    id,
    ...source,
    ...(state.overrides[id] || {}),
    approval: state.approvals[id] || null
  }));
  return { entries, count: entries.length, updatedAt: state.updatedAt };
}

export function getSourceRegistryEntry(id) {
  return listSourceRegistry().entries.find((entry) => entry.id === id) || null;
}

export async function updateSourceRegistryEntry(id, patch, actor) {
  if (!BUILTIN_SOURCES[id]) throw new Error('Unknown source');
  const allowed = ['licenseStatus', 'canonicalUrl', 'effectiveDate', 'supersededBy', 'reuseNotes', 'enabled', 'notes'];
  const sanitized = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key)));
  await registryStore.mutate((state) => {
    state.overrides[id] = { ...(state.overrides[id] || {}), ...sanitized };
    state.updatedAt = new Date().toISOString();
    state.lastActor = actor;
  });
  return getSourceRegistryEntry(id);
}

export async function approveSourceRegistryEntry(id, { reviewer, reason }) {
  if (!BUILTIN_SOURCES[id]) throw new Error('Unknown source');
  await registryStore.mutate((state) => {
    state.approvals[id] = {
      reviewer,
      reason: String(reason || '').slice(0, 1000),
      approvedAt: new Date().toISOString()
    };
    state.updatedAt = new Date().toISOString();
  });
  return getSourceRegistryEntry(id);
}
