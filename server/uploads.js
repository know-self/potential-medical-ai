import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { fetchJson } from './lib/http.js';
import { EncryptedJsonStore, encryptBuffer, decryptBuffer } from './lib/encryptedJsonStore.js';
import { redactText } from './sharing.js';

const metadataStore = new EncryptedJsonStore(config.uploadMetadataFile, config.privacy.encryptionKey, {
  schemaVersion: 1,
  uploads: []
});

const MAGIC_CHECKS = {
  'application/pdf': (buffer) => buffer.subarray(0, 5).toString() === '%PDF-',
  'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9,
  'application/json': (buffer) => {
    try { JSON.parse(buffer.toString('utf8')); return true; } catch { return false; }
  },
  'text/plain': () => true
};

function safeFilename(value = 'upload') {
  return path.basename(String(value)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'upload';
}

async function malwareScan(buffer, metadata) {
  if (!config.uploads.malwareScannerUrl) {
    if (config.uploads.requireMalwareScan) {
      const error = new Error('Malware scanner is required but not configured');
      error.statusCode = 503;
      throw error;
    }
    return { status: 'not-configured', scanner: null };
  }
  const result = await fetchJson(config.uploads.malwareScannerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      mimeType: metadata.mimeType,
      filename: metadata.filename,
      size: buffer.length,
      contentBase64: buffer.toString('base64')
    })
  }, config.requestTimeoutMs);
  if (result.clean !== true) {
    const error = new Error('Upload rejected by malware scanner');
    error.statusCode = 422;
    throw error;
  }
  return { status: 'clean', scanner: result.scanner || 'configured-service', scannedAt: new Date().toISOString() };
}

function builtInExtraction(buffer, mimeType) {
  if (mimeType === 'text/plain') {
    const text = buffer.toString('utf8').slice(0, 250000);
    const lines = text.split(/\r?\n/);
    return {
      status: 'complete',
      confidence: 0.98,
      text: redactText(text),
      citations: lines.map((line, index) => ({
        locator: `line:${index + 1}`,
        text: redactText(line).slice(0, 500)
      })).filter((item) => item.text).slice(0, 2000)
    };
  }
  if (mimeType === 'application/json') {
    const value = JSON.parse(buffer.toString('utf8'));
    const text = JSON.stringify(value, null, 2).slice(0, 250000);
    return {
      status: 'complete',
      confidence: 0.99,
      text: redactText(text),
      citations: text.split('\n').map((line, index) => ({ locator: `json-line:${index + 1}`, text: redactText(line).slice(0, 500) })).slice(0, 2000)
    };
  }
  if (mimeType === 'application/pdf') {
    const raw = buffer.toString('latin1');
    const pageCount = Math.max(1, (raw.match(/\/Type\s*\/Page\b/g) || []).length);
    const strings = [...raw.matchAll(/\(([^()]|\\.){3,500}\)\s*Tj/g)]
      .map((match) => match[0].replace(/\)\s*Tj$/, '').slice(1).replace(/\\([()\\])/g, '$1'))
      .filter((value) => /[A-Za-zÀ-ỹ]/.test(value))
      .slice(0, 500);
    return {
      status: strings.length ? 'partial' : 'external-extractor-required',
      confidence: strings.length ? 0.25 : 0,
      text: redactText(strings.join('\n')),
      pageCount,
      citations: strings.map((text, index) => ({ locator: `pdf-fragment:${index + 1}`, page: null, text: redactText(text).slice(0, 500) })),
      warning: 'Built-in PDF extraction is intentionally low confidence. Configure DOCUMENT_EXTRACTOR_URL for page-aware production extraction.'
    };
  }
  return {
    status: 'no-text-extraction',
    confidence: 0,
    text: '',
    citations: [],
    warning: mimeType.startsWith('image/')
      ? 'Medical images are not diagnostically interpreted by this platform.'
      : 'No extractor is available for this file type.'
  };
}

async function externalExtraction(buffer, metadata) {
  if (!config.uploads.extractorUrl) return null;
  const result = await fetchJson(config.uploads.extractorUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      contentBase64: buffer.toString('base64'),
      requirePageCitations: true,
      deidentify: true
    })
  }, Math.max(config.requestTimeoutMs, 60000));
  return {
    status: 'complete',
    confidence: Number(result.confidence) || 0,
    text: redactText(String(result.text || '')).slice(0, 500000),
    pageCount: result.pageCount || null,
    citations: Array.isArray(result.citations) ? result.citations.slice(0, 5000).map((item) => ({
      page: item.page || null,
      locator: item.locator || null,
      text: redactText(item.text || '').slice(0, 1000),
      confidence: Number(item.confidence) || null
    })) : []
  };
}

export async function initializeUploads() {
  if (!metadataStore.isConfigured()) throw new Error('Encrypted upload storage is not configured');
  await fs.mkdir(config.uploadDirectory, { recursive: true, mode: 0o700 });
  return metadataStore.initialize();
}

export async function storeUpload(userId, input = {}) {
  const mimeType = String(input.mimeType || '').toLowerCase();
  if (!config.uploads.allowedMimeTypes.includes(mimeType)) throw new Error('File type is not allowed');
  const buffer = Buffer.from(String(input.contentBase64 || ''), 'base64');
  if (!buffer.length) throw new Error('Upload content is empty');
  if (buffer.length > config.uploads.maxBytes) {
    const error = new Error('Upload exceeds configured size limit');
    error.statusCode = 413;
    throw error;
  }
  if (!MAGIC_CHECKS[mimeType]?.(buffer)) throw new Error('File content does not match declared MIME type');
  if (mimeType.startsWith('image/') && input.requestMedicalInterpretation === true && !config.uploads.medicalImageAnalysisEnabled) {
    const error = new Error('Diagnostic medical image interpretation is not enabled');
    error.statusCode = 422;
    throw error;
  }

  const id = crypto.randomUUID();
  const filename = safeFilename(input.filename);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const scan = await malwareScan(buffer, { filename, mimeType });
  const extraction = await externalExtraction(buffer, { filename, mimeType }) || builtInExtraction(buffer, mimeType);
  const storedPath = path.join(config.uploadDirectory, `${id}.enc`);
  await fs.writeFile(storedPath, encryptBuffer(buffer, config.privacy.encryptionKey), { mode: 0o600 });

  const metadata = {
    id,
    ownerUserId: userId,
    filename,
    mimeType,
    size: buffer.length,
    sha256,
    scan,
    extraction,
    storedPath,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + config.uploads.retentionDays * 24 * 60 * 60 * 1000).toISOString()
  };
  await metadataStore.mutate((state) => {
    state.uploads.unshift(metadata);
    state.uploads = state.uploads.slice(0, 5000);
  });
  return { ...metadata, storedPath: undefined };
}

export function listUploads(userId) {
  return metadataStore.snapshot().uploads
    .filter((item) => item.ownerUserId === userId)
    .map(({ storedPath, ...item }) => item);
}

export async function readUpload(userId, id, { includeBytes = false } = {}) {
  const metadata = metadataStore.snapshot().uploads.find((item) => item.id === id && item.ownerUserId === userId);
  if (!metadata) throw new Error('Upload not found');
  const output = { ...metadata, storedPath: undefined };
  if (includeBytes) {
    output.contentBase64 = decryptBuffer(await fs.readFile(metadata.storedPath), config.privacy.encryptionKey).toString('base64');
  }
  return output;
}

export async function deleteUpload(userId, id) {
  let removed = null;
  await metadataStore.mutate((state) => {
    const index = state.uploads.findIndex((item) => item.id === id && item.ownerUserId === userId);
    if (index < 0) throw new Error('Upload not found');
    [removed] = state.uploads.splice(index, 1);
  });
  await fs.rm(removed.storedPath, { force: true });
  return { deleted: true, id };
}

export async function pruneExpiredUploads(now = Date.now()) {
  const expired = metadataStore.snapshot().uploads.filter((item) => Date.parse(item.expiresAt) <= now);
  for (const item of expired) await fs.rm(item.storedPath, { force: true });
  await metadataStore.mutate((state) => {
    state.uploads = state.uploads.filter((item) => Date.parse(item.expiresAt) > now);
  });
  return { removed: expired.length };
}
