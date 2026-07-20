import React, { useEffect, useMemo, useState } from 'react';
import { medicalApi } from '../services/apiClient';

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export default function AssistantControlPanel({
  open,
  onClose,
  token,
  onTokenChange,
  messages,
  selectedAttachmentIds,
  onSelectedAttachmentIdsChange
}) {
  const [profile, setProfile] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [shares, setShares] = useState([]);
  const [contextForm, setContextForm] = useState({
    ageRange: '', medications: '', allergies: '', diagnoses: '', pregnancyStatus: '', preferredLanguage: 'vi'
  });
  const [status, setStatus] = useState('');
  const [labInput, setLabInput] = useState('[{"name":"Glucose","value":100,"unit":"mg/dL","referenceLow":70,"referenceHigh":99}]');
  const [labResult, setLabResult] = useState(null);
  const [timelineForm, setTimelineForm] = useState({ type: 'symptom', label: '', value: '' });

  const authenticated = Boolean(token);
  const contextPayload = useMemo(() => ({
    ...contextForm,
    medications: splitList(contextForm.medications),
    allergies: splitList(contextForm.allergies),
    diagnoses: splitList(contextForm.diagnoses)
  }), [contextForm]);

  async function refresh() {
    if (!token) return;
    try {
      const [nextProfile, uploadPayload, sharePayload] = await Promise.all([
        medicalApi.getProfile(token),
        medicalApi.listUploads(token),
        medicalApi.listShares(token)
      ]);
      setProfile(nextProfile);
      setUploads(uploadPayload.uploads || []);
      setShares(sharePayload.shares || []);
      const context = nextProfile.context || {};
      setContextForm({
        ageRange: context.ageRange || '',
        medications: (context.medications || []).join(', '),
        allergies: (context.allergies || []).join(', '),
        diagnoses: (context.diagnoses || []).join(', '),
        pregnancyStatus: context.pregnancyStatus || '',
        preferredLanguage: context.preferredLanguage || 'vi'
      });
      setStatus('Secure profile loaded.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  useEffect(() => {
    if (open && token) refresh();
  }, [open, token]);

  if (!open) return null;

  async function acceptConsent() {
    try {
      await medicalApi.setConsent(token, {
        accepted: true,
        version: '1.0',
        purposes: ['structured-context', 'timeline', 'secure-clinician-sharing', 'encrypted-upload']
      });
      await refresh();
      setStatus('Consent recorded.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function saveContext() {
    try {
      await medicalApi.updateContext(token, contextPayload);
      await refresh();
      setStatus('Patient-provided context saved.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setStatus('Uploading and extracting…');
      await medicalApi.uploadFile(token, file);
      await refresh();
      setStatus('Upload stored with extraction metadata.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      event.target.value = '';
    }
  }

  async function createShare() {
    try {
      const result = await medicalApi.createShare(token, {
        label: 'Clinician review',
        transcript: messages,
        expiresInMinutes: 60,
        redact: true,
        includeContext: true
      });
      const url = `${window.location.origin}/api/shares/public/${encodeURIComponent(result.token)}`;
      await navigator.clipboard?.writeText(url);
      await refresh();
      setStatus(`Secure share created and copied. Expires ${result.expiresAt}`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function addTimeline() {
    try {
      await medicalApi.addTimeline(token, { ...timelineForm, confirmedByUser: true, occurredAt: new Date().toISOString() });
      setTimelineForm({ type: 'symptom', label: '', value: '' });
      await refresh();
      setStatus('User-confirmed timeline event added.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function downloadExport(format) {
    try {
      await medicalApi.downloadExport(token, format);
      setStatus(`Clinician export created (${format}).`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  async function explainLabs() {
    try {
      const results = JSON.parse(labInput);
      setLabResult(await medicalApi.explainLabs({ locale: contextForm.preferredLanguage, results }));
      setStatus('Lab values compared with the supplied ranges.');
    } catch (error) {
      setStatus(error.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={onClose}>
      <aside className="w-full max-w-lg h-full overflow-y-auto bg-white dark:bg-gray-900 p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Assistant controls</h2>
            <p className="text-xs text-gray-500">Chat remains the primary product. These controls add consented context and evidence.</p>
          </div>
          <button className="px-3 py-1 rounded border" onClick={onClose}>Close</button>
        </div>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Secure session</h3>
          <p className="text-xs text-gray-500 mb-2">Paste a short-lived user session token issued by the configured identity/bootstrap flow. Stored only in sessionStorage.</p>
          <input className="w-full border rounded p-2" type="password" value={token} onChange={(event) => onTokenChange(event.target.value)} placeholder="User session token" />
          <button className="mt-2 px-3 py-2 border rounded" disabled={!authenticated} onClick={refresh}>Load profile</button>
        </section>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Consent and structured context</h3>
          <p className="text-xs text-gray-500">Information remains user-provided and never silently becomes a diagnosis.</p>
          <div className="text-xs my-2">Consent: {profile?.consent?.acceptedAt && !profile?.consent?.revokedAt ? 'active' : 'not active'}</div>
          <button className="px-3 py-2 border rounded mb-3" disabled={!authenticated} onClick={acceptConsent}>Record consent</button>
          {Object.entries(contextForm).map(([key, value]) => (
            <label className="block text-xs mb-2" key={key}>{key}
              <input className="w-full border rounded p-2 mt-1" value={value} onChange={(event) => setContextForm((previous) => ({ ...previous, [key]: event.target.value }))} />
            </label>
          ))}
          <button className="px-3 py-2 rounded bg-blue-700 text-white" disabled={!authenticated} onClick={saveContext}>Save context</button>
        </section>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Evidence uploads</h3>
          <input className="my-2" type="file" accept="text/plain,application/json,application/pdf,image/png,image/jpeg" disabled={!authenticated} onChange={upload} />
          <div className="space-y-2">
            {uploads.map((item) => (
              <label key={item.id} className="block border rounded p-2 text-xs">
                <input
                  type="checkbox"
                  checked={selectedAttachmentIds.includes(item.id)}
                  onChange={(event) => onSelectedAttachmentIdsChange(event.target.checked
                    ? [...selectedAttachmentIds, item.id]
                    : selectedAttachmentIds.filter((id) => id !== item.id))}
                />{' '}{item.filename} — {item.extraction?.status}, confidence {item.extraction?.confidence ?? 'n/a'}
              </label>
            ))}
          </div>
        </section>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Longitudinal timeline and clinician export</h3>
          <select className="w-full border rounded p-2 my-1" value={timelineForm.type} onChange={(event) => setTimelineForm((previous) => ({ ...previous, type: event.target.value }))}>
            <option value="symptom">Symptom</option><option value="medication">Medication</option><option value="measurement">Measurement</option><option value="diagnosis-reported">Reported diagnosis</option><option value="note">Note</option>
          </select>
          <input className="w-full border rounded p-2 my-1" placeholder="Label" value={timelineForm.label} onChange={(event) => setTimelineForm((previous) => ({ ...previous, label: event.target.value }))} />
          <input className="w-full border rounded p-2 my-1" placeholder="Value / note" value={timelineForm.value} onChange={(event) => setTimelineForm((previous) => ({ ...previous, value: event.target.value }))} />
          <button className="px-3 py-2 border rounded mt-1" disabled={!authenticated || !timelineForm.label} onClick={addTimeline}>Add confirmed event</button>
          <div className="max-h-28 overflow-y-auto text-xs mt-2">{(profile?.timeline || []).slice(0, 20).map((item) => <div key={item.id}>{item.occurredAt} — {item.label}: {item.value}</div>)}</div>
          <div className="flex gap-2 mt-2"><button className="px-3 py-2 border rounded" disabled={!authenticated} onClick={() => downloadExport('fhir')}>FHIR JSON</button><button className="px-3 py-2 border rounded" disabled={!authenticated} onClick={() => downloadExport('html')}>Printable HTML</button></div>
        </section>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Secure clinician sharing</h3>
          <button className="px-3 py-2 rounded bg-emerald-700 text-white" disabled={!authenticated || messages.length === 0} onClick={createShare}>Create 60-minute redacted link</button>
          <div className="mt-2 text-xs">{shares.map((item) => <div key={item.id}>{item.label} — {item.revokedAt ? 'revoked' : `expires ${item.expiresAt}`}</div>)}</div>
        </section>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Laboratory range explanation</h3>
          <textarea className="w-full border rounded p-2 h-28 font-mono text-xs" value={labInput} onChange={(event) => setLabInput(event.target.value)} />
          <button className="px-3 py-2 border rounded" onClick={explainLabs}>Compare supplied values</button>
          {labResult && <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 text-xs whitespace-pre-wrap">{JSON.stringify(labResult, null, 2)}</pre>}
        </section>

        <div className="text-xs text-gray-600 break-words">{status}</div>
      </aside>
    </div>
  );
}
