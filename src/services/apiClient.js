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

export async function streamApi(path, payload, onChunk) {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok || !response.body) throw new Error(await parseError(response));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const chunk = parsed.choices?.[0]?.delta?.content || '';
        if (chunk) {
          fullText += chunk;
          onChunk?.(chunk);
        }
      } catch {
        // Ignore partial or non-JSON SSE lines from upstream providers.
      }
    }

    if (done) break;
  }

  return fullText;
}

export const medicalApi = {
  health: () => apiRequest('/api/health'),
  knowledgeStatus: () => apiRequest('/api/knowledge/status'),
  searchKnowledge: (query, limit = 8) => apiRequest(`/api/knowledge/search?q=${encodeURIComponent(query)}&limit=${limit}`),
  assessSafety: (text, locale) => apiRequest('/api/safety/assess', { method: 'POST', body: JSON.stringify({ text, locale }) }),
  generateGoogle: (prompt, options = {}) => apiRequest('/api/models/google/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt, ...options })
  })
};
