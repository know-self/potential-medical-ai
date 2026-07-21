import React, { useEffect, useMemo, useState } from 'react';
import { isAuthenticationError, medicalApi } from '../services/apiClient';
import { defaultModelSettings, normalizeModelSettings } from '../services/modelSettings';
import { loadSessionWorkspace } from '../services/sessionWorkspace';

function splitList(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function headersText(headers = {}) {
  return Object.keys(headers).length ? JSON.stringify(headers, null, 2) : '';
}

export default function AssistantControlPanel({
  open,
  onClose,
  token,
  onTokenChange,
  modelSettings,
  onModelSettingsChange,
  messages,
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [modelDraft, setModelDraft] = useState(modelSettings || defaultModelSettings);
  const [customHeadersText, setCustomHeadersText] = useState(headersText(modelSettings?.headers));
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

  useEffect(() => {
    if (!open) return;
    setModelDraft(modelSettings || defaultModelSettings);
    setCustomHeadersText(headersText(modelSettings?.headers));
  }, [open, token, modelSettings]);

  function resetPrivateState() {
    setProfile(null);
    setUploads([]);
    setShares([]);
  }

  function applyProfile(nextProfile) {
    setProfile(nextProfile);
    const context = nextProfile.context || {};
    setContextForm({
      ageRange: context.ageRange || '',
      medications: (context.medications || []).join(', '),
      allergies: (context.allergies || []).join(', '),
      diagnoses: (context.diagnoses || []).join(', '),
      pregnancyStatus: context.pregnancyStatus || '',
      preferredLanguage: context.preferredLanguage || 'vi'
    });
  }

  async function loadSessionData(sessionToken, verifiedProfile = null) {
    const workspace = await loadSessionWorkspace(medicalApi, sessionToken, { verifiedProfile });
    applyProfile(workspace.profile);
    setUploads(workspace.uploads);
    setShares(workspace.shares);
    return workspace.profile;
  }

  function handlePrivateError(error) {
    if (isAuthenticationError(error)) {
      onTokenChange('');
      setTokenDraft('');
      resetPrivateState();
      setStatus('Secure session expired or is invalid. It was cleared; paste and verify a new token.');
      return;
    }
    setStatus(error.message);
  }

  async function refresh() {
    if (!token) return;
    try {
      await loadSessionData(token);
      setStatus('Secure profile loaded.');
    } catch (error) {
      handlePrivateError(error);
    }
  }

  async function authenticate(action) {
    try {
      setStatus(action === 'register' ? 'Creating account…' : 'Signing in…');
      const result = action === 'register'
        ? await medicalApi.register({ email, password })
        : await medicalApi.login({ email, password });
      const verifiedProfile = await medicalApi.getProfile(result.token);
      await loadSessionData(result.token, verifiedProfile);
      onTokenChange(result.token);
      setPassword('');
      setStatus(`Signed in as ${result.user.email}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function saveModel() {
    try {
      const headers = customHeadersText.trim() ? JSON.parse(customHeadersText) : {};
      if (!headers || typeof headers !== 'object' || Array.isArray(headers)) throw new Error('Custom headers must be a JSON object');
      const next = normalizeModelSettings({ ...modelDraft, headers });
      if (!next.endpoint || !next.model) throw new Error('Endpoint and model are required');
      onModelSettingsChange(next);
      setModelDraft(next);
      setStatus(`Custom model saved for this tab: ${next.model}.`);
    } catch (error) {
      setStatus(error.message);
    }
  }

  function clearModel() {
    setModelDraft({ ...defaultModelSettings });
    setCustomHeadersText('');
    onModelSettingsChange(null);
    setStatus('Custom model endpoint and key were cleared from this tab.');
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
      handlePrivateError(error);
    }
  }

  async function saveContext() {
    try {
      await medicalApi.updateContext(token, contextPayload);
      await refresh();
      setStatus('Patient-provided context saved.');
    } catch (error) {
      handlePrivateError(error);
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
      handlePrivateError(error);
    }
  }

  async function addTimeline() {
    try {
      await medicalApi.addTimeline(token, { ...timelineForm, confirmedByUser: true, occurredAt: new Date().toISOString() });
      setTimelineForm({ type: 'symptom', label: '', value: '' });
      await refresh();
      setStatus('User-confirmed timeline event added.');
    } catch (error) {
      handlePrivateError(error);
    }
  }

  async function downloadExport(format) {
    try {
      await medicalApi.downloadExport(token, format);
      setStatus(`Clinician export created (${format}).`);
    } catch (error) {
      handlePrivateError(error);
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
            <p className="text-xs text-gray-500">Configure a model and secure session. Evidence routing is automatic.</p>
          </div>
          <button className="px-3 py-1 rounded border" onClick={onClose}>Close</button>
        </div>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Custom model runtime</h3>
          <p className="text-xs text-gray-500 mb-3">The endpoint, model, API key, and headers are stored only in this browser tab. The key is forwarded through the local safety gateway for each request and is never written to server storage.</p>
          <label className="block text-xs mb-2">OpenAI-compatible endpoint
            <input className="w-full border rounded p-2 mt-1" value={modelDraft.endpoint} onChange={(event) => setModelDraft((previous) => ({ ...previous, endpoint: event.target.value }))} placeholder="https://api.example.com/v1/chat/completions" autoComplete="off" />
          </label>
          <label className="block text-xs mb-2">Model
            <input className="w-full border rounded p-2 mt-1" value={modelDraft.model} onChange={(event) => setModelDraft((previous) => ({ ...previous, model: event.target.value }))} placeholder="your-model-name" autoComplete="off" />
          </label>
          <label className="block text-xs mb-2">API key
            <input className="w-full border rounded p-2 mt-1" type="password" value={modelDraft.apiKey} onChange={(event) => setModelDraft((previous) => ({ ...previous, apiKey: event.target.value }))} placeholder="Optional for local models" autoComplete="off" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs mb-2">Temperature
              <input className="w-full border rounded p-2 mt-1" type="number" min="0" max="2" step="0.05" value={modelDraft.temperature} onChange={(event) => setModelDraft((previous) => ({ ...previous, temperature: event.target.value }))} />
            </label>
            <label className="block text-xs mb-2">Max output tokens
              <input className="w-full border rounded p-2 mt-1" type="number" min="64" max="32768" step="64" value={modelDraft.maxTokens} onChange={(event) => setModelDraft((previous) => ({ ...previous, maxTokens: event.target.value }))} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs mb-2">
            <input type="checkbox" checked={modelDraft.includePatientContext} onChange={(event) => setModelDraft((previous) => ({ ...previous, includePatientContext: event.target.checked }))} />
            Include consented patient context in model prompts
          </label>
          <label className="block text-xs mb-2">Additional system instruction
            <textarea className="w-full border rounded p-2 mt-1 h-20" value={modelDraft.systemPrompt} onChange={(event) => setModelDraft((previous) => ({ ...previous, systemPrompt: event.target.value }))} placeholder="Optional style or domain instruction. Core medical safety rules remain enforced." />
          </label>
          <label className="block text-xs mb-2">Additional request headers (JSON)
            <textarea className="w-full border rounded p-2 mt-1 h-20 font-mono" value={customHeadersText} onChange={(event) => setCustomHeadersText(event.target.value)} placeholder='{"x-api-version":"2026-01"}' />
          </label>
          <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-2">Use only endpoints you trust. Public remote endpoints must use HTTPS. Loopback HTTP is allowed for local runtimes such as LM Studio, Ollama-compatible proxies, or vLLM.</p>
          <div className="flex gap-2">
            <button className="px-3 py-2 rounded bg-blue-700 text-white" disabled={!String(modelDraft.endpoint || '').trim() || !String(modelDraft.model || '').trim()} onClick={saveModel}>Save for this tab</button>
            <button className="px-3 py-2 border rounded" onClick={clearModel}>Clear</button>
          </div>
        </section>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Account</h3>
          <p className="text-xs text-gray-500 mb-2">Sign in to encrypt and access your private uploads, health context, and clinician shares.</p>
          {!authenticated ? <>
            <input className="w-full border rounded p-2 mb-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" autoComplete="email" autoFocus />
            <input className="w-full border rounded p-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (at least 12 characters)" autoComplete="current-password" />
            <div className="flex gap-2 mt-2">
              <button className="px-3 py-2 rounded bg-blue-700 text-white" disabled={!email.trim() || !password} onClick={() => authenticate('login')}>Sign in</button>
              <button className="px-3 py-2 border rounded" disabled={!email.trim() || !password} onClick={() => authenticate('register')}>Create account</button>
            </div>
          </> : <div className="flex gap-2 mt-2">
            <span className="text-xs py-2 text-emerald-700 dark:text-emerald-300">Signed in with a secure session.</span>
            <button className="px-3 py-2 border rounded" onClick={() => { onTokenChange(''); resetPrivateState(); setStatus('Signed out.'); }}>Sign out</button>
            <button className="px-3 py-2 border rounded" onClick={refresh}>Reload</button>
          </div>}
        </section>

        <section className="border rounded-lg p-3 mb-4">
          <h3 className="font-medium">Consent and structured context</h3>
          <p className="text-xs text-gray-500">Information remains user-provided and never silently becomes a diagnosis.</p>
          <div className="text-xs my-2">Consent: {profile?.consent?.acceptedAt && !profile?.consent.revokedAt ? 'active' : 'not active'}</div>
          <button className="px-3 py-2 border rounded mb-3" disabled={!authenticated} onClick={acceptConsent}>Record consent</button>
          {Object.entries(contextForm).map(([key, value]) => (
            <label className="block text-xs mb-2" key={key}>{key}
              <input className="w-full border rounded p-2 mt-1" value={value} onChange={(event) => setContextForm((previous) => ({ ...previous, [key]: event.target.value }))} />
            </label>
          ))}
          <button className="px-3 py-2 rounded bg-blue-700 text-white" disabled={!authenticated} onClick={saveContext}>Save context</button>
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

        <div className="text-xs text-gray-600 break-words" role="status">{status}</div>
      </aside>
    </div>
  );
}
