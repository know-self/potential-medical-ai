const API_BASE_URL = String(import.meta.env.VITE_MEDICAL_API_URL || '').replace(/\/$/, '');

function apiUrl(path) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function parseError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return payload.error || payload.message || text;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiRequest(path, options = {}) {
  const { token, raw, headers, ...requestOptions } = options;
  const response = await fetch(apiUrl(path), {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(token),
      ...(headers || {})
    }
  });
  if (!response.ok) throw new Error(await parseError(response));
  if (raw) return response;
  return response.status === 204 ? null : response.json();
}

export async function streamMedicalChat(message, history, onChunk, options = {}) {
  const response = await fetch(apiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(options.token) },
    body: JSON.stringify({
      message,
      history,
      locale: options.locale || 'auto',
      attachmentIds: options.attachmentIds || []
    })
  });
  if (!response.ok || !response.body) throw new Error(await parseError(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let metadata = null;
  let streamError = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const rawEvent of events) {
      const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) continue;
      try {
        const payload = JSON.parse(dataLine.slice(5).trim());
        if (payload.type === 'chunk' && payload.text) {
          fullText += payload.text;
          onChunk?.(payload.text);
        } else if (payload.type === 'done') {
          metadata = payload;
        } else if (payload.type === 'error') {
          streamError = payload.error || 'Medical chat stream failed';
        }
      } catch {
        // Ignore malformed events; the gateway emits a final done/error event.
      }
    }
    if (done) break;
  }

  if (streamError && !fullText) throw new Error(streamError);
  return { text: fullText, metadata, error: streamError };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '');
    reader.readAsDataURL(file);
  });
}

async function downloadExport(token, format = 'fhir') {
  const response = await apiRequest(`/api/privacy/export?format=${encodeURIComponent(format)}`, { token, raw: true });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = format === 'html' ? 'patient-summary.html' : 'patient-summary.fhir.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const medicalApi = {
  health: () => apiRequest('/api/health'),
  publicStatus: () => apiRequest('/api/status'),
  knowledgeStatus: () => apiRequest('/api/knowledge/status'),
  searchKnowledge: (query, limit = 8, locale = 'auto') => apiRequest(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=${limit}&locale=${locale}`),
  terminology: (query, locale = 'auto') => apiRequest(`/api/knowledge/terminology?q=${encodeURIComponent(query)}&locale=${locale}`),
  streamChat: streamMedicalChat,
  getProfile: (token) => apiRequest('/api/privacy/me', { token }),
  setConsent: (token, payload) => apiRequest('/api/privacy/consent', { method: 'POST', token, body: JSON.stringify(payload) }),
  updateContext: (token, payload) => apiRequest('/api/privacy/context', { method: 'PATCH', token, body: JSON.stringify(payload) }),
  addTimeline: (token, payload) => apiRequest('/api/privacy/timeline', { method: 'POST', token, body: JSON.stringify(payload) }),
  listUploads: (token) => apiRequest('/api/uploads', { token }),
  uploadFile: async (token, file) => apiRequest('/api/uploads', {
    method: 'POST',
    token,
    body: JSON.stringify({ filename: file.name, mimeType: file.type || 'application/octet-stream', contentBase64: await fileToBase64(file) })
  }),
  deleteUpload: (token, id) => apiRequest(`/api/uploads/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  createShare: (token, payload) => apiRequest('/api/shares', { method: 'POST', token, body: JSON.stringify(payload) }),
  listShares: (token) => apiRequest('/api/shares', { token }),
  revokeShare: (token, id) => apiRequest(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  explainLabs: (payload) => apiRequest('/api/labs/explain', { method: 'POST', body: JSON.stringify(payload) }),
  downloadExport,
  exportUrl: (format = 'fhir') => apiUrl(`/api/privacy/export?format=${encodeURIComponent(format)}`)
};
