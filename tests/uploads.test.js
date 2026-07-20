import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { config } from '../server/config.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'medical-upload-'));
config.privacy.encryptionKey = 'test-upload-encryption-key-with-32-characters';
config.uploadDirectory = path.join(directory, 'objects');
config.uploadMetadataFile = path.join(directory, 'metadata.json');
config.uploads.requireMalwareScan = false;
config.uploads.malwareScannerUrl = '';
config.uploads.extractorUrl = '';
config.uploads.maxBytes = 100000;

const uploads = await import(`../server/uploads.js?test=${Date.now()}`);
await uploads.initializeUploads();

test('text upload is encrypted and extracted with line citations', async () => {
  const result = await uploads.storeUpload('user-1', {
    filename: 'notes.txt',
    mimeType: 'text/plain',
    contentBase64: Buffer.from('Line one\nEmail person@example.com').toString('base64')
  });
  assert.equal(result.extraction.status, 'complete');
  assert.equal(result.extraction.citations[0].locator, 'line:1');
  assert.match(result.extraction.text, /redacted-email/);
  const stored = await uploads.readUpload('user-1', result.id, { includeBytes: true });
  assert.equal(Buffer.from(stored.contentBase64, 'base64').toString('utf8'), 'Line one\nEmail person@example.com');
});

test('declared mime type must match file signature', async () => {
  await assert.rejects(() => uploads.storeUpload('user-1', {
    filename: 'fake.pdf',
    mimeType: 'application/pdf',
    contentBase64: Buffer.from('not a pdf').toString('base64')
  }), /does not match/i);
});
