export const MODEL_SETTINGS_STORAGE_KEY = 'pmai-custom-model-settings';

export const defaultModelSettings = Object.freeze({
  endpoint: '',
  model: '',
  apiKey: '',
  mode: 'direct',
  temperature: 0.2,
  maxTokens: 4096,
  systemPrompt: '',
  includePatientContext: false,
  headers: {}
});

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

export function normalizeModelSettings(value = {}) {
  return {
    endpoint: String(value.endpoint || '').trim(),
    model: String(value.model || '').trim(),
    apiKey: String(value.apiKey || '').trim(),
    mode: ['direct', 'document-rag', 'knowledge-rag'].includes(value.mode) ? value.mode : 'direct',
    temperature: clamp(value.temperature, 0, 2, 0.2),
    maxTokens: Math.round(clamp(value.maxTokens, 64, 32768, 4096)),
    systemPrompt: String(value.systemPrompt || '').slice(0, 12000),
    includePatientContext: value.includePatientContext === true,
    headers: value.headers && typeof value.headers === 'object' && !Array.isArray(value.headers) ? value.headers : {}
  };
}

export function modelSettingsReady(value) {
  const settings = normalizeModelSettings(value);
  return Boolean(settings.endpoint && settings.model);
}

export function loadModelSettings(storage = sessionStorage) {
  try {
    const raw = storage.getItem(MODEL_SETTINGS_STORAGE_KEY);
    return raw ? normalizeModelSettings(JSON.parse(raw)) : { ...defaultModelSettings };
  } catch {
    storage.removeItem(MODEL_SETTINGS_STORAGE_KEY);
    return { ...defaultModelSettings };
  }
}

export function saveModelSettings(value, storage = sessionStorage) {
  const settings = normalizeModelSettings(value);
  storage.setItem(MODEL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  return settings;
}

export function clearModelSettings(storage = sessionStorage) {
  storage.removeItem(MODEL_SETTINGS_STORAGE_KEY);
  return { ...defaultModelSettings };
}
