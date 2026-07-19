import crypto from 'node:crypto';
import { AtomicJsonStore } from '../server/lib/atomicJsonStore.js';
import { config } from '../server/config.js';

const metricsStore = new AtomicJsonStore(config.metricsFile, {
  counters: {},
  gauges: {},
  timings: {},
  updatedAt: null
});
const incidentStore = new AtomicJsonStore(config.incidentFile, { incidents: [] });

export async function initializeObservability() {
  await Promise.all([metricsStore.initialize(), incidentStore.initialize()]);
}

export async function incrementMetric(name, labels = {}, amount = 1) {
  const key = `${name}:${JSON.stringify(labels, Object.keys(labels).sort())}`;
  await metricsStore.mutate((state) => {
    state.counters[key] = (state.counters[key] || 0) + amount;
    state.updatedAt = new Date().toISOString();
  });
}

export async function setGauge(name, value, labels = {}) {
  const key = `${name}:${JSON.stringify(labels, Object.keys(labels).sort())}`;
  await metricsStore.mutate((state) => {
    state.gauges[key] = Number(value);
    state.updatedAt = new Date().toISOString();
  });
}

export async function observeTiming(name, milliseconds, labels = {}) {
  const key = `${name}:${JSON.stringify(labels, Object.keys(labels).sort())}`;
  await metricsStore.mutate((state) => {
    const current = state.timings[key] || { count: 0, sumMs: 0, maxMs: 0 };
    current.count += 1;
    current.sumMs += Number(milliseconds) || 0;
    current.maxMs = Math.max(current.maxMs, Number(milliseconds) || 0);
    state.timings[key] = current;
    state.updatedAt = new Date().toISOString();
  });
}

export function getMetrics() {
  return metricsStore.snapshot();
}

export function prometheusMetrics() {
  const metrics = getMetrics();
  const lines = [];
  for (const [key, value] of Object.entries(metrics.counters)) {
    const [name] = key.split(':');
    lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
  }
  for (const [key, value] of Object.entries(metrics.gauges)) {
    const [name] = key.split(':');
    lines.push(`# TYPE ${name} gauge`, `${name} ${value}`);
  }
  for (const [key, value] of Object.entries(metrics.timings)) {
    const [name] = key.split(':');
    lines.push(
      `# TYPE ${name}_milliseconds summary`,
      `${name}_milliseconds_count ${value.count}`,
      `${name}_milliseconds_sum ${value.sumMs}`,
      `${name}_milliseconds_max ${value.maxMs}`
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function createIncident({ title, severity = 'warning', description = '', actor = 'system' }) {
  const incident = {
    id: crypto.randomUUID(),
    title: String(title).slice(0, 200),
    severity: ['info', 'warning', 'critical'].includes(severity) ? severity : 'warning',
    description: String(description).slice(0, 5000),
    status: 'open',
    actor,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updates: []
  };
  await incidentStore.mutate((state) => {
    state.incidents.unshift(incident);
    state.incidents = state.incidents.slice(0, 500);
  });
  return incident;
}

export function listIncidents({ publicOnly = false } = {}) {
  const incidents = incidentStore.snapshot().incidents;
  return incidents.filter((item) => !publicOnly || item.status !== 'internal');
}

export async function updateIncident(id, patch, actor) {
  let updated = null;
  await incidentStore.mutate((state) => {
    const incident = state.incidents.find((item) => item.id === id);
    if (!incident) throw new Error('Incident not found');
    const nextStatus = ['open', 'monitoring', 'resolved', 'internal'].includes(patch.status) ? patch.status : incident.status;
    incident.status = nextStatus;
    incident.updatedAt = new Date().toISOString();
    incident.updates.unshift({
      actor,
      note: String(patch.note || '').slice(0, 3000),
      status: nextStatus,
      timestamp: incident.updatedAt
    });
    updated = structuredClone(incident);
  });
  return updated;
}
