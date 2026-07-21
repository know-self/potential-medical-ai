import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSessionWorkspace } from '../src/services/sessionWorkspace.js';

test('stale sessions stop after the profile verification request', async () => {
  const calls = [];
  const authError = Object.assign(new Error('Invalid authentication token'), { status: 401, code: 'AUTH_TOKEN_INVALID' });
  const api = {
    getProfile: async () => { calls.push('profile'); throw authError; },
    listUploads: async () => { calls.push('uploads'); return { uploads: [] }; },
    listShares: async () => { calls.push('shares'); return { shares: [] }; }
  };

  await assert.rejects(() => loadSessionWorkspace(api, 'stale-token'), authError);
  assert.deepEqual(calls, ['profile']);
});

test('valid sessions load uploads and shares only after verification', async () => {
  const calls = [];
  const profile = { context: { preferredLanguage: 'vi' } };
  const api = {
    getProfile: async () => { calls.push('profile'); return profile; },
    listUploads: async () => { calls.push('uploads'); return { uploads: [{ id: 'u1' }] }; },
    listShares: async () => { calls.push('shares'); return { shares: [{ id: 's1' }] }; }
  };

  const result = await loadSessionWorkspace(api, 'valid-token');
  assert.equal(calls[0], 'profile');
  assert.deepEqual(new Set(calls.slice(1)), new Set(['uploads', 'shares']));
  assert.equal(result.profile, profile);
  assert.deepEqual(result.uploads, [{ id: 'u1' }]);
  assert.deepEqual(result.shares, [{ id: 's1' }]);
});
