import fetch from 'node-fetch';
import { router as chatRouter } from '../../src/endpoints/world-simulation/chat.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';
import { startTestServer } from './helpers.js';

let server, url;

beforeEach(async () => {
    server = await startTestServer(chatRouter, {});
    url = server.url;
});

afterEach(async () => {
    await server.stop();
    setLLMAdapter(null);
});

// NOTE: startTestServer mounts the router at /api/world-sim and returns that as url.
// The chat router's routes are at /:worldId (no /chat prefix — that is added in index.js mount).
// So the test URL is ${url}/w1, not ${url}/chat/w1.

test('POST /w1 streams SSE deltas then done', async () => {
    setLLMAdapter(async () => 'Hello world');
    const res = await fetch(`${url}/w1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemPrompt: 'You are a narrator.',
            messages: [{ role: 'user', content: 'What happens next?' }],
            apiConfig: {},
        }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const text = await res.text();
    expect(text).toContain('"delta":"Hello world"');
    expect(text).toContain('"done":true');
});

test('POST /w1 returns 400 when systemPrompt missing', async () => {
    const res = await fetch(`${url}/w1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
});

test('POST /w1 returns SSE error event when LLM throws', async () => {
    setLLMAdapter(async () => { throw new Error('llm_down'); });
    const res = await fetch(`${url}/w1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemPrompt: 'sys',
            messages: [{ role: 'user', content: 'hi' }],
            apiConfig: {},
        }),
    });
    expect(res.status).toBe(200); // SSE starts before LLM call
    const text = await res.text();
    expect(text).toContain('"error"');
});
