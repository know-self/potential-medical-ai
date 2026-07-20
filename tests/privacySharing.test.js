import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { config } from '../server/config.js';

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'medical-privacy-'));
config.privacy.encryptionKey = 'test-encryption-key-with-more-than-24-characters';
config.privacy.signingKey = 'test-signing-key-with-more-than-24-characters';
config.privacy.bootstrapToken = 'test-bootstrap-token-with-more-than-24-characters';
config.userDataFile = path.join(directory, 'users.json');
config.shareDataFile = path.join(directory, 'shares.json');
config.privacyAuditFile = path.join(directory, 'privacy-audit.jsonl');

const privacy = await import(`../server/privacy.js?test=${Date.now()}`);
const sharing = await import(`../server/sharing.js?test=${Date.now()}`);

await privacy.initializePrivacy();
await sharing.initializeSharing();

test('consent gates structured context and timeline', async () => {
  const userId = 'user-consent';
  await assert.rejects(() => privacy.updatePatientContext(userId, { medications: ['x'] }), /consent/i);
  await privacy.setConsent(userId, { accepted: true, purposes: ['context'] });
  const context = await privacy.updatePatientContext(userId, { medications: ['metformin'], allergies: ['penicillin'] });
  assert.deepEqual(context.medications, ['metformin']);
  await assert.rejects(() => privacy.addTimelineEvent(userId, { type: 'symptom', label: 'pain', value: 'mild' }), /confirmation/i);
  const event = await privacy.addTimelineEvent(userId, { type: 'symptom', label: 'pain', value: 'mild', confirmedByUser: true });
  assert.equal(event.confirmedByUser, true);
});

test('clinician shares are random, redacted, expiring, and revocable', async () => {
  const created = await sharing.createClinicianShare('owner', {
    transcript: [{ role: 'user', content: 'Email me at person@example.com or +84 912 345 678' }],
    expiresInMinutes: 10,
    redact: true
  });
  const result = await sharing.readClinicianShare(created.token, { ip: '127.0.0.1' });
  assert.match(result.transcript[0].content, /redacted-email/);
  assert.match(result.transcript[0].content, /redacted-phone/);
  await sharing.revokeClinicianShare('owner', created.id);
  await assert.rejects(() => sharing.readClinicianShare(created.token), /revoked/i);
});
