async function getCsrfToken() {
  try {
    const res = await fetch('/csrf-token');
    const data = await res.json();
    return data.token === 'disabled' ? null : data.token;
  } catch {
    return null;
  }
}

export async function fetchSSE(url, body, onChunk) {
  const token = await getCsrfToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-csrf-token'] = token;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try { onChunk(JSON.parse(data)); } catch { /* skip malformed */ }
      }
    }
    if (buffer.trim().startsWith('data: ')) {
      try { onChunk(JSON.parse(buffer.trim().slice(6))); } catch { /* skip */ }
    }
  } finally {
    reader.cancel();
  }
}
