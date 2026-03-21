import { apiFetch } from './client.js';

export async function buildContext(payload) {
    return apiFetch('/api/world-sim/context/build', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function streamChat({ worldId, systemPrompt, messages, apiConfig, onDelta, onDone }) {
    const res = await fetch(`/api/world-sim/chat/${worldId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages, apiConfig }),
    });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));
            if (data.done) { onDone?.(); return; }
            if (data.error) throw new Error(data.error);
            if (data.delta) onDelta?.(data.delta);
        }
    }
    onDone?.();
}
