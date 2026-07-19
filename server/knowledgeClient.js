import { config } from './config.js';
import { fetchJson } from './lib/http.js';

function urlFor(path, params = {}) {
  const url = new URL(path, `${config.knowledgePlaneUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function get(path, params) {
  return fetchJson(urlFor(path, params), {}, config.knowledgeRequestTimeoutMs);
}

export const knowledgePlane = {
  health: () => get('/health'),
  status: () => get('/status'),
  publicStatus: () => get('/public/status'),
  search: (query, options = {}) => get('/search', {
    q: query,
    limit: options.limit || 8,
    maxEvidenceTier: options.maxEvidenceTier || 4,
    source: options.sources || [],
    locale: options.locale || 'auto'
  }),
  terminology: (query, options = {}) => get('/terminology', {
    q: query,
    locale: options.locale || 'auto',
    limit: options.limit || 10
  }),
  diseases: () => get('/diseases'),
  disease: (id) => get(`/diseases/${encodeURIComponent(id)}`)
};
