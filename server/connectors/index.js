import crypto from 'node:crypto';
import { config } from '../config.js';
import { fetchJson, fetchWithTimeout, normalizeUrl, stripMarkup } from '../lib/http.js';

function slug(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function stableId(prefix, value) {
  const hash = crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
  return `${prefix}:${hash}`;
}

function pickTag(block, tag) {
  const match = String(block).match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripMarkup(match[1]) : '';
}

function pickAtomLink(block) {
  const match = String(block).match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : '';
}

export function parseRss(xml, source = 'rss', { jurisdiction = 'global', evidenceTier = 1 } = {}) {
  const blocks = [
    ...(String(xml).match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || []),
    ...(String(xml).match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [])
  ];

  return blocks.map((block) => {
    const title = pickTag(block, 'title');
    const description = pickTag(block, 'description') || pickTag(block, 'summary') || pickTag(block, 'content');
    const guid = pickTag(block, 'guid') || pickTag(block, 'id');
    const link = pickTag(block, 'link') || pickAtomLink(block);
    const publishedAt = pickTag(block, 'pubDate') || pickTag(block, 'published') || pickTag(block, 'updated') || null;
    const externalId = guid || link || `${title}:${publishedAt}`;

    return {
      id: stableId(source, externalId),
      source,
      sourceType: 'guideline-feed',
      title: title || 'Untitled guideline update',
      content: description,
      abstract: description,
      category: 'guideline',
      evidenceTier,
      reviewStatus: 'clinical-review-required',
      jurisdiction,
      sourceVersion: publishedAt || guid || null,
      publishedAt,
      updatedAt: publishedAt,
      retrievedAt: new Date().toISOString(),
      canonicalUrl: link || null,
      metadata: { externalId }
    };
  }).filter((item) => item.title && (item.content || item.canonicalUrl));
}

async function syncPubMed() {
  const term = `(${config.syncTopics.join(' OR ')}) AND (guideline[Publication Type] OR systematic review[Publication Type] OR clinical trial[Publication Type])`;
  const common = {
    db: 'pubmed',
    retmode: 'json',
    tool: config.pubmed.tool,
    email: config.pubmed.email,
    api_key: config.pubmed.apiKey
  };
  const searchUrl = normalizeUrl('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
    ...common,
    term,
    retmax: config.maxItemsPerSource,
    sort: 'pub date'
  });
  const search = await fetchJson(searchUrl, {}, config.requestTimeoutMs);
  const ids = search?.esearchresult?.idlist || [];
  if (!ids.length) return [];

  const summaryUrl = normalizeUrl('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi', {
    ...common,
    id: ids.join(',')
  });
  const summary = await fetchJson(summaryUrl, {}, config.requestTimeoutMs);

  return ids.map((pmid) => {
    const item = summary?.result?.[pmid] || {};
    const authors = (item.authors || []).map((author) => author.name).filter(Boolean);
    const publicationDate = item.pubdate || item.epubdate || null;
    const title = stripMarkup(item.title || `PubMed ${pmid}`);
    const content = [
      title,
      authors.length ? `Authors: ${authors.join(', ')}` : '',
      item.fulljournalname ? `Journal: ${item.fulljournalname}` : '',
      publicationDate ? `Publication date: ${publicationDate}` : '',
      item.doctype ? `Document type: ${item.doctype}` : ''
    ].filter(Boolean).join('\n');

    return {
      id: `pubmed:${pmid}`,
      source: 'pubmed',
      sourceType: 'research',
      title,
      content,
      abstract: '',
      category: 'research',
      evidenceTier: 2,
      reviewStatus: 'evidence-candidate',
      jurisdiction: 'global',
      sourceVersion: publicationDate || item.sortpubdate || null,
      publishedAt: publicationDate,
      updatedAt: item.sortpubdate || publicationDate,
      retrievedAt: new Date().toISOString(),
      canonicalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      metadata: { pmid, authors, journal: item.fulljournalname || null }
    };
  });
}

async function syncClinicalTrials() {
  const query = config.syncTopics.join(' OR ');
  const url = normalizeUrl('https://clinicaltrials.gov/api/v2/studies', {
    'query.cond': query,
    pageSize: config.maxItemsPerSource,
    format: 'json',
    sort: 'LastUpdatePostDate:desc'
  });
  const payload = await fetchJson(url, {}, config.requestTimeoutMs);
  return (payload.studies || []).map((study) => {
    const protocol = study.protocolSection || {};
    const id = protocol.identificationModule?.nctId;
    const title = protocol.identificationModule?.briefTitle || id;
    const conditions = protocol.conditionsModule?.conditions || [];
    const status = protocol.statusModule?.overallStatus || 'UNKNOWN';
    const updatedAt = protocol.statusModule?.studyFirstPostDateStruct?.date || protocol.statusModule?.studyFirstPostDate || null;
    const lastUpdate = protocol.statusModule?.lastUpdatePostDateStruct?.date || protocol.statusModule?.lastUpdatePostDate || updatedAt;
    const summary = protocol.descriptionModule?.briefSummary || '';

    return {
      id: `clinicaltrials:${id}`,
      source: 'clinicaltrials.gov',
      sourceType: 'trial-registry',
      title,
      content: [summary, `Conditions: ${conditions.join(', ')}`, `Status: ${status}`].filter(Boolean).join('\n'),
      abstract: summary,
      aliases: conditions,
      category: 'clinical-trial',
      evidenceTier: 3,
      reviewStatus: 'evidence-candidate',
      jurisdiction: 'global',
      sourceVersion: lastUpdate,
      publishedAt: updatedAt,
      updatedAt: lastUpdate,
      retrievedAt: new Date().toISOString(),
      canonicalUrl: `https://clinicaltrials.gov/study/${id}`,
      metadata: { nctId: id, status, conditions }
    };
  }).filter((item) => item.id && item.title);
}

async function syncOpenFda() {
  const search = '(status:"Ongoing"+OR+status:"Completed")';
  const url = normalizeUrl('https://api.fda.gov/drug/enforcement.json', {
    search,
    limit: config.maxItemsPerSource,
    api_key: config.openFda.apiKey
  });
  const payload = await fetchJson(url, {}, config.requestTimeoutMs);
  return (payload.results || []).map((item) => {
    const recallNumber = item.recall_number || stableId('recall', JSON.stringify(item));
    const title = `${item.product_description || 'Drug recall'} — ${item.classification || 'Unclassified'}`;
    const date = item.recall_initiation_date || item.report_date || null;
    return {
      id: `openfda-recall:${recallNumber}`,
      source: 'openfda-drug-enforcement',
      sourceType: 'safety-alert',
      title,
      content: [
        item.reason_for_recall,
        item.recalling_firm ? `Recalling firm: ${item.recalling_firm}` : '',
        item.distribution_pattern ? `Distribution: ${item.distribution_pattern}` : '',
        item.status ? `Status: ${item.status}` : ''
      ].filter(Boolean).join('\n'),
      category: 'drug-safety',
      evidenceTier: 1,
      reviewStatus: 'clinical-review-required',
      jurisdiction: item.country || 'United States',
      sourceVersion: item.report_date || date,
      publishedAt: date,
      updatedAt: item.report_date || date,
      retrievedAt: new Date().toISOString(),
      canonicalUrl: 'https://open.fda.gov/apis/drug/enforcement/',
      metadata: { recallNumber, classification: item.classification || null, status: item.status || null }
    };
  });
}

async function syncCdc() {
  const output = [];
  for (const topic of config.cdcTopics.slice(0, 6)) {
    const url = normalizeUrl('https://tools.cdc.gov/api/v2/resources/media', {
      q: topic,
      max: Math.max(1, Math.ceil(config.maxItemsPerSource / Math.max(config.cdcTopics.length, 1)))
    });
    const payload = await fetchJson(url, {}, config.requestTimeoutMs);
    const results = payload.results || payload.resources || [];
    for (const item of results) {
      const title = item.name || item.title || `CDC: ${topic}`;
      const link = item.targetUrl || item.url || item.sourceUrl || null;
      const content = stripMarkup(item.description || item.summary || item.content || '');
      output.push({
        id: stableId('cdc', item.id || link || title),
        source: 'cdc-content-services',
        sourceType: 'public-health-guidance',
        title,
        content,
        abstract: content,
        aliases: [topic],
        category: 'public-health',
        evidenceTier: 1,
        reviewStatus: 'clinical-review-required',
        jurisdiction: 'United States',
        sourceVersion: item.lastUpdated || item.dateModified || null,
        publishedAt: item.datePublished || null,
        updatedAt: item.lastUpdated || item.dateModified || null,
        retrievedAt: new Date().toISOString(),
        canonicalUrl: link,
        metadata: { topic }
      });
    }
  }
  return output.slice(0, config.maxItemsPerSource);
}

async function syncDailyMed() {
  const output = [];
  for (const setId of config.dailyMedSetIds.slice(0, config.maxItemsPerSource)) {
    const url = `https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/${encodeURIComponent(setId)}.json`;
    const payload = await fetchJson(url, {}, config.requestTimeoutMs);
    const item = payload.data || payload;
    const title = item.title || item.spl_version || `DailyMed label ${setId}`;
    output.push({
      id: `dailymed:${setId}`,
      source: 'dailymed',
      sourceType: 'drug-label',
      title,
      content: stripMarkup(item.label || item.description || JSON.stringify(item).slice(0, 12000)),
      category: 'drug-label',
      evidenceTier: 1,
      reviewStatus: 'clinical-review-required',
      jurisdiction: 'United States',
      sourceVersion: item.spl_version || item.version || null,
      publishedAt: item.published_date || null,
      updatedAt: item.published_date || null,
      retrievedAt: new Date().toISOString(),
      canonicalUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setId}`,
      metadata: { setId }
    });
  }
  return output;
}

async function syncWhoIcd() {
  if (!config.icd.clientId || !config.icd.clientSecret) return [];
  const tokenResponse = await fetchWithTimeout('https://icdaccessmanagement.who.int/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.icd.clientId,
      client_secret: config.icd.clientSecret,
      scope: 'icdapi_access',
      grant_type: 'client_credentials'
    })
  }, config.requestTimeoutMs);
  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error('WHO ICD authentication failed');

  const releaseUrl = `https://id.who.int/icd/release/11/${encodeURIComponent(config.icd.release)}/mms`;
  const payload = await fetchJson(releaseUrl, {
    headers: {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      Accept: 'application/json',
      'Accept-Language': config.icd.language,
      'API-Version': 'v2'
    }
  }, config.requestTimeoutMs);

  return [{
    id: `who-icd11:${config.icd.release}:mms`,
    source: 'who-icd-11',
    sourceType: 'terminology',
    title: payload.title?.['@value'] || `WHO ICD-11 MMS ${config.icd.release}`,
    content: `WHO ICD-11 Mortality and Morbidity Statistics release ${config.icd.release}.`,
    category: 'terminology',
    evidenceTier: 1,
    reviewStatus: 'approved',
    jurisdiction: 'global',
    sourceVersion: config.icd.release,
    publishedAt: payload.releaseDate || null,
    updatedAt: payload.releaseDate || null,
    retrievedAt: new Date().toISOString(),
    canonicalUrl: releaseUrl,
    metadata: { release: config.icd.release }
  }];
}

async function syncFeedList(source, urls, options) {
  const output = [];
  for (const url of urls.slice(0, 10)) {
    const response = await fetchWithTimeout(url, {}, config.requestTimeoutMs);
    const xml = await response.text();
    if (!response.ok) throw new Error(`${source} feed ${response.status}`);
    output.push(...parseRss(xml, source, options));
  }
  return output.slice(0, config.maxItemsPerSource);
}

export const connectorRegistry = {
  pubmed: syncPubMed,
  'clinicaltrials.gov': syncClinicalTrials,
  'openfda-drug-enforcement': syncOpenFda,
  'cdc-content-services': syncCdc,
  dailymed: syncDailyMed,
  'who-icd-11': syncWhoIcd,
  'who-guidelines': () => syncFeedList('who-guidelines', config.feeds.who, { jurisdiction: 'global', evidenceTier: 1 }),
  'nice-guidelines': () => syncFeedList('nice-guidelines', config.feeds.nice, { jurisdiction: 'United Kingdom', evidenceTier: 1 }),
  'vietnam-moh': () => syncFeedList('vietnam-moh', config.feeds.vietnamMoh, { jurisdiction: 'Vietnam', evidenceTier: 1 })
};

export async function runConnectors({ store, sources } = {}) {
  if (!store) throw new Error('Knowledge store is required');
  const selected = sources?.length ? sources : Object.keys(connectorRegistry);
  const summary = [];

  for (const source of selected) {
    const connector = connectorRegistry[source];
    if (!connector) {
      summary.push({ source, status: 'skipped', reason: 'unknown-source' });
      continue;
    }

    const startedAt = new Date().toISOString();
    try {
      const documents = await connector();
      const result = await store.upsertMany(documents);
      await store.setSourceState(source, { status: 'ok', startedAt, completedAt: new Date().toISOString(), documents: documents.length, ...result });
      summary.push({ source, status: 'ok', documents: documents.length, ...result });
    } catch (error) {
      await store.setSourceState(source, { status: 'error', startedAt, completedAt: new Date().toISOString(), error: error.message });
      summary.push({ source, status: 'error', error: error.message });
    }
  }

  return { completedAt: new Date().toISOString(), sources: summary };
}
