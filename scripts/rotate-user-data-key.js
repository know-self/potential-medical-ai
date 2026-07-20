import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.js';
import { rotateEncryptedFile } from '../server/lib/encryptedJsonStore.js';

const oldKey = process.env.OLD_USER_DATA_ENCRYPTION_KEY || '';
const newKey = process.env.NEW_USER_DATA_ENCRYPTION_KEY || '';
if (oldKey.length < 24 || newKey.length < 24) {
  throw new Error('OLD_USER_DATA_ENCRYPTION_KEY and NEW_USER_DATA_ENCRYPTION_KEY must each contain at least 24 characters');
}

const files = [config.userDataFile, config.shareDataFile, config.uploadMetadataFile];
try {
  const entries = await fs.readdir(config.uploadDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.enc')) files.push(path.join(config.uploadDirectory, entry.name));
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const results = [];
for (const file of files) {
  try {
    results.push(await rotateEncryptedFile(file, oldKey, newKey));
  } catch (error) {
    if (error.code === 'ENOENT') results.push({ filePath: file, rotated: false, reason: 'not-found' });
    else throw error;
  }
}
console.log(JSON.stringify({ rotatedAt: new Date().toISOString(), results }, null, 2));
