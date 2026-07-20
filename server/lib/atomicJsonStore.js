import fs from 'node:fs/promises';
import path from 'node:path';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export class AtomicJsonStore {
  constructor(filePath, fallback = {}) {
    this.filePath = filePath;
    this.fallback = fallback;
    this.value = clone(fallback);
    this.initialized = false;
    this.writeChain = Promise.resolve();
  }

  async initialize() {
    if (this.initialized) return clone(this.value);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      this.value = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.value = clone(this.fallback);
      await this.#persist();
    }
    this.initialized = true;
    return clone(this.value);
  }

  snapshot() {
    if (!this.initialized) throw new Error(`Store not initialized: ${this.filePath}`);
    return clone(this.value);
  }

  async replace(nextValue) {
    await this.initialize();
    this.value = clone(nextValue);
    await this.#persist();
    return clone(this.value);
  }

  async mutate(mutator) {
    await this.initialize();
    const draft = clone(this.value);
    const result = await mutator(draft);
    this.value = result === undefined ? draft : clone(result);
    await this.#persist();
    return clone(this.value);
  }

  async #persist() {
    const payload = `${JSON.stringify(this.value, null, 2)}\n`;
    this.writeChain = this.writeChain.then(async () => {
      const temporary = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporary, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.rename(temporary, this.filePath);
    });
    await this.writeChain;
  }
}

export async function appendJsonLine(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}
