import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function deriveKey(secret) {
  if (!secret || String(secret).length < 24) throw new Error('Encryption key must contain at least 24 characters');
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encrypt(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decrypt(payload, secret) {
  if (!payload?.ciphertext) return payload;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

export class EncryptedJsonStore {
  constructor(filePath, secret, fallback = {}) {
    this.filePath = filePath;
    this.secret = secret;
    this.fallback = fallback;
    this.value = structuredClone(fallback);
    this.initialized = false;
    this.writeChain = Promise.resolve();
  }

  isConfigured() {
    return Boolean(this.secret && String(this.secret).length >= 24);
  }

  async initialize() {
    if (this.initialized) return this.snapshot();
    if (!this.isConfigured()) throw new Error('Encrypted storage is not configured');
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.value = decrypt(JSON.parse(await fs.readFile(this.filePath, 'utf8')), this.secret);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.value = structuredClone(this.fallback);
      await this.#persist();
    }
    this.initialized = true;
    return this.snapshot();
  }

  snapshot() {
    if (!this.initialized) throw new Error('Encrypted store not initialized');
    return structuredClone(this.value);
  }

  async mutate(mutator) {
    await this.initialize();
    const draft = this.snapshot();
    const result = await mutator(draft);
    this.value = structuredClone(result === undefined ? draft : result);
    await this.#persist();
    return this.snapshot();
  }

  async #persist() {
    const payload = `${JSON.stringify(encrypt(this.value, this.secret))}\n`;
    this.writeChain = this.writeChain.then(async () => {
      const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, this.filePath);
    });
    await this.writeChain;
  }
}

export function encryptBuffer(buffer, secret) {
  return Buffer.from(JSON.stringify(encrypt({ data: Buffer.from(buffer).toString('base64') }, secret)));
}

export function decryptBuffer(buffer, secret) {
  const payload = JSON.parse(Buffer.from(buffer).toString('utf8'));
  return Buffer.from(decrypt(payload, secret).data, 'base64');
}

export async function rotateEncryptedFile(filePath, oldSecret, newSecret) {
  const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
  const value = decrypt(payload, oldSecret);
  const temporary = `${filePath}.${process.pid}.${Date.now()}.rotate.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(encrypt(value, newSecret))}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporary, filePath);
  return { filePath, rotated: true };
}
