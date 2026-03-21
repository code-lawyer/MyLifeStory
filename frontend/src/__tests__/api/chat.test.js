import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildContext, streamChat } from '../../api/chat.js';

beforeEach(() => { vi.restoreAllMocks(); });

describe('buildContext', () => {
  it('POSTs to /context/build and returns result', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble' }),
    });
    const result = await buildContext({ worldCard: {}, chatHistory: [], tokenBudget: 4096, mode: 'ensemble' });
    expect(result.systemPrompt).toBe('sys');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/world-sim/context/build',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('streamChat', () => {
  it('reads SSE deltas and calls onDelta/onDone', async () => {
    const sseBody = 'data: {"delta":"Hello"}\n\ndata: {"delta":" world"}\n\ndata: {"done":true}\n\n';
    const encoder = new TextEncoder();
    const encoded = encoder.encode(sseBody);
    let offset = 0;
    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (offset >= encoded.length) return { done: true, value: undefined };
        const chunk = encoded.slice(offset, offset + 20);
        offset += 20;
        return { done: false, value: chunk };
      }),
      cancel: vi.fn(),
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => mockReader },
    });
    const deltas = [];
    let done = false;
    await streamChat({
      worldId: 'w1', systemPrompt: 'sys',
      messages: [], apiConfig: {},
      onDelta: (d) => deltas.push(d),
      onDone: () => { done = true; },
    });
    expect(deltas.join('')).toBe('Hello world');
    expect(done).toBe(true);
  });
});
