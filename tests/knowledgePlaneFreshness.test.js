import assert from 'node:assert/strict';
import test from 'node:test';

const { evaluateFreshness } = await import('../knowledge-plane/service.js');

function freshState(now) {
  return {
    pubmed: { status: 'ok', completedAt: new Date(now - 30 * 60_000).toISOString() },
    'clinicaltrials.gov': { status: 'ok', completedAt: new Date(now - 30 * 60_000).toISOString() },
    'openfda-drug-enforcement': { status: 'ok', completedAt: new Date(now - 30 * 60_000).toISOString() },
    'cdc-content-services': { status: 'ok', completedAt: new Date(now - 30 * 60_000).toISOString() }
  };
}

test('freshness is usable when all required sources meet their SLO', () => {
  const now = Date.parse('2026-07-19T00:00:00Z');
  const result = evaluateFreshness({ sourceState: freshState(now) }, now);
  assert.equal(result.level, 'fresh');
  assert.equal(result.usable, true);
});

test('freshness fails closed when a required source was never synchronized', () => {
  const now = Date.parse('2026-07-19T00:00:00Z');
  const state = freshState(now);
  delete state.pubmed;
  const result = evaluateFreshness({ sourceState: state }, now);
  assert.equal(result.level, 'stale');
  assert.equal(result.usable, false);
  assert.equal(result.sources.pubmed.status, 'never-synced');
});

test('freshness fails closed when a required source exceeds maximum age', () => {
  const now = Date.parse('2026-07-19T00:00:00Z');
  const state = freshState(now);
  state['openfda-drug-enforcement'].completedAt = new Date(now - 7 * 60 * 60_000).toISOString();
  const result = evaluateFreshness({ sourceState: state }, now);
  assert.equal(result.level, 'stale');
  assert.equal(result.sources['openfda-drug-enforcement'].fresh, false);
});
