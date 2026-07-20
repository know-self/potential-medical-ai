import crypto from 'node:crypto';
import { config } from './config.js';

const tenantUsage = new Map();
const responseCache = new Map();
const circuits = new Map();

function hourKey(now = new Date()) {
  return now.toISOString().slice(0, 13);
}

function dayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function consumeTenantBudget(tenantId = 'anonymous', characterCount = 0) {
  const now = new Date();
  const key = String(tenantId || 'anonymous').slice(0, 200);
  const usage = tenantUsage.get(key) || { hour: hourKey(now), requests: 0, day: dayKey(now), characters: 0 };
  if (usage.hour !== hourKey(now)) {
    usage.hour = hourKey(now);
    usage.requests = 0;
  }
  if (usage.day !== dayKey(now)) {
    usage.day = dayKey(now);
    usage.characters = 0;
  }
  if (usage.requests >= config.capacity.tenantRequestsPerHour) {
    const error = new Error('Tenant request quota exceeded');
    error.statusCode = 429;
    throw error;
  }
  if (usage.characters + characterCount > config.capacity.tenantCharactersPerDay) {
    const error = new Error('Tenant daily character budget exceeded');
    error.statusCode = 429;
    throw error;
  }
  usage.requests += 1;
  usage.characters += characterCount;
  tenantUsage.set(key, usage);
  return structuredClone(usage);
}

export function cacheKey(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function getCachedResponse(key) {
  const item = responseCache.get(key);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return structuredClone(item.value);
}

export function setCachedResponse(key, value) {
  responseCache.set(key, {
    value: structuredClone(value),
    expiresAt: Date.now() + config.capacity.cacheTtlMinutes * 60_000
  });
  if (responseCache.size > 1000) {
    const first = responseCache.keys().next().value;
    responseCache.delete(first);
  }
}

function circuit(provider) {
  return circuits.get(provider) || { failures: 0, openedAt: null, successes: 0 };
}

export function isCircuitOpen(provider) {
  const state = circuit(provider);
  if (!state.openedAt) return false;
  if (Date.now() - state.openedAt >= config.capacity.circuitResetSeconds * 1000) {
    state.openedAt = null;
    state.failures = 0;
    circuits.set(provider, state);
    return false;
  }
  return true;
}

export function recordProviderSuccess(provider) {
  const state = circuit(provider);
  state.successes += 1;
  state.failures = 0;
  state.openedAt = null;
  circuits.set(provider, state);
}

export function recordProviderFailure(provider) {
  const state = circuit(provider);
  state.failures += 1;
  if (state.failures >= config.capacity.circuitFailureThreshold) state.openedAt = Date.now();
  circuits.set(provider, state);
}

export function capacityStatus() {
  return {
    activeTenants: tenantUsage.size,
    cachedResponses: responseCache.size,
    circuits: Object.fromEntries([...circuits.entries()].map(([provider, state]) => [provider, {
      ...state,
      open: isCircuitOpen(provider)
    }]))
  };
}
