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

export async function apiRequest(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.status === 204 ? null : response.json();
}

export async function streamMedicalChat(message, history, onChunk) {
  const response = await fetch(apiUrl('/api/chat/stream'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history })
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

export const medicalApi = {
  health: () => apiRequest('/api/health'),
  knowledgeStatus: () => apiRequest('/api/knowledge/status'),
  searchKnowledge: (query, limit = 8) => apiRequest(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  streamChat: streamMedicalChat
};
