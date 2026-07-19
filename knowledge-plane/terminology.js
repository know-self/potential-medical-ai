import { config } from '../server/config.js';
import { fetchJson } from '../server/lib/http.js';
import { diseaseCatalog } from '../server/knowledge/diseaseCatalog.js';

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s./%-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNIT_PATTERN = /\b(?:mmol\/l|mg\/dl|mmhg|mcg|mg|kg|ml|bpm|iu|units?|g|l)\b|%/gi;
const DOSE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:mcg|mg|ml|iu|units?|g)\b/gi;

export function resolveTerminology(input, { locale = 'auto', limit = 10 } = {}) {
  const text = String(input || '');
  const normalized = normalize(text);
  const tokens = new Set(normalized.split(' ').filter(Boolean));
  const matches = diseaseCatalog.map((item) => {
    const aliases = item.aliases || [item.name, item.nameVi];
    let score = 0;
    const matchedAliases = [];
    for (const alias of aliases) {
      const normalizedAlias = normalize(alias);
      if (!normalizedAlias) continue;
      if (normalized.includes(normalizedAlias)) {
        score += normalizedAlias.length <= 3 ? 4 : 10;
        matchedAliases.push(alias);
      } else {
        const aliasTokens = normalizedAlias.split(' ');
        const overlap = aliasTokens.filter((token) => tokens.has(token)).length;
        score += overlap;
      }
    }
    return score ? {
      id: item.id,
      name: item.name,
      nameVi: item.nameVi,
      category: item.category,
      matchedAliases: [...new Set(matchedAliases)],
      score
    } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit);

  return {
    input: text,
    locale: locale === 'auto' ? detectLocale(text) : locale,
    matches,
    protectedTokens: {
      doses: [...new Set(text.match(DOSE_PATTERN) || [])],
      units: [...new Set(text.match(UNIT_PATTERN) || [])]
    }
  };
}

export function detectLocale(value = '') {
  const text = String(value);
  const hasVietnameseDiacritic = /[\u0300-\u036f]/.test(text.normalize('NFD'));
  const hasVietnameseWord = /(?:^|\s)(?:toi|tôi|minh|mình|benh|bệnh|thuoc|thuốc|dau|đau|khong|không|trieu chung|triệu chứng|hai lan|hai lần|moi ngay|mỗi ngày|mang thai|tang huyet ap)(?:\s|$)/i.test(text);
  return hasVietnameseDiacritic || hasVietnameseWord ? 'vi' : 'en';
}

export function localeRoutingPreference(value = '', explicitLocale = 'auto') {
  const locale = explicitLocale === 'auto' ? detectLocale(value) : explicitLocale;
  return {
    locale,
    preferredJurisdiction: locale === 'vi' ? 'Vietnam' : 'global',
    fallbackJurisdictions: locale === 'vi'
      ? ['global', 'United Kingdom', 'United States']
      : ['global', 'United States', 'United Kingdom']
  };
}

export async function resolveSnomedTerm(input, { limit = 10 } = {}) {
  if (!config.snomed.baseUrl) {
    return { configured: false, matches: [], warning: 'SNOMED terminology server is not configured.' };
  }
  const url = new URL('/ValueSet/$expand', `${config.snomed.baseUrl}/`);
  url.searchParams.set('url', 'http://snomed.info/sct?fhir_vs');
  url.searchParams.set('filter', String(input || '').slice(0, 300));
  url.searchParams.set('count', String(Math.min(Math.max(Number(limit) || 10, 1), 50)));
  const headers = { Accept: 'application/fhir+json, application/json' };
  if (config.snomed.bearerToken) headers.Authorization = `Bearer ${config.snomed.bearerToken}`;
  const payload = await fetchJson(url.toString(), { headers }, config.knowledgeRequestTimeoutMs);
  const contains = payload.expansion?.contains || [];
  return {
    configured: true,
    matches: contains.map((item) => ({
      system: item.system || 'http://snomed.info/sct',
      code: item.code,
      display: item.display,
      inactive: item.inactive === true
    })),
    total: payload.expansion?.total ?? contains.length,
    licenseStatus: 'operator-validation-required'
  };
}
