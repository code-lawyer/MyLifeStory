# World Simulator Main Interface — Implementation Plan 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `WorldPage` skeleton with a fully working main interface: SSE-streaming chat, world-evolution event proposal card, three RPG overlay panels (map, player profile, inventory), and a world archive page.

**Architecture:** A new `chat.js` backend router streams LLM responses via SSE. The frontend assembles world context by calling the existing `/context/build` endpoint before each send, then streams via `ReadableStream`. `WorldPage` composes `ChatPane`, `EventProposalCard`, and three slide-over panels; all store interactions use existing Zustand stores. `WorldArchivePage` is a separate route rendered over the same layout.

**Tech Stack:** Node.js 18 ESM + Express 4 (backend), React 18 + Vite 5, Zustand 4, Tailwind CSS 3, Vitest + @testing-library/react (frontend), Jest (backend)

---

## File Structure

### Backend — new / modified
- Create: `src/endpoints/world-simulation/chat.js` — `POST /:worldId` SSE streaming chat endpoint
- Modify: `src/endpoints/world-simulation/llm-client.js` — add `streamLLM` (streaming variant, same `adapter` mock hook)
- Modify: `src/endpoints/world-simulation/index.js` — mount chat router at `/chat`
- Test: `tests/world-simulation/chat.test.js`

### Frontend — new files
```
frontend/src/
  api/
    chat.js          # streamChat (SSE), buildContext
    player.js        # getPlayer, updateStatus, addItem, deleteItem
    scenes.js        # listScenes, enterScene
    events.js        # listEvents, confirmEvent, deleteEvent, proposeEvent
  components/
    chat/
      ChatPane.jsx          # message list + input + SSE integration
      EventProposalCard.jsx # floats above input; accept/ignore
    panels/
      MapPanel.jsx          # slide-over; scene nodes, locked/unlocked
      PlayerProfilePanel.jsx # slide-over; status fields + PATCH
      InventoryPanel.jsx    # slide-over; item list + delete
  pages/
    WorldPage.jsx           # full implementation (replaces skeleton)
    WorldArchivePage.jsx    # /world/:worldId/archive — state, events, chars, scenes
frontend/src/__tests__/
  api/
    chat.test.js
    player.test.js
    scenes.test.js
    events.test.js
  components/
    chat/ChatPane.test.jsx
    chat/EventProposalCard.test.jsx
    panels/MapPanel.test.jsx
    panels/PlayerProfilePanel.test.jsx
    panels/InventoryPanel.test.jsx
  pages/
    WorldPage.test.jsx
    WorldArchivePage.test.jsx
```

### Frontend — modified files
- Modify: `frontend/src/App.jsx` — add `/world/:worldId/archive` route

---

## Task 1: SSE Streaming Chat Backend

**Files:**
- Modify: `src/endpoints/world-simulation/llm-client.js`
- Create: `src/endpoints/world-simulation/chat.js`
- Modify: `src/endpoints/world-simulation/index.js`
- Test: `tests/world-simulation/chat.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/world-simulation/chat.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:ws -- --testPathPattern=chat
```
Expected: FAIL — module not found

- [ ] **Step 3: Add `streamLLM` to llm-client.js**

Add after `callLLM` export:

```js
/**
 * Stream LLM response, calling onChunk for each text delta.
 * Falls back to adapter (returns full text as single chunk) in test mode.
 * @param {object[]} messages
 * @param {string} systemPrompt
 * @param {object} apiConfig - { apiUrl, apiKey, model }
 * @param {(delta: string) => void} onChunk
 */
export async function streamLLM(messages, systemPrompt, apiConfig, onChunk) {
    if (adapter) {
        const text = await adapter(messages, systemPrompt);
        onChunk(text);
        return;
    }

    const { apiUrl, apiKey, model } = apiConfig;
    const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            stream: true,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
        }),
    });

    if (!response.ok) throw new Error(`LLM API error: ${response.status}`);

    let buffer = '';
    for await (const chunk of response.body) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
                const parsed = JSON.parse(data);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta) onChunk(delta);
            } catch { /* skip malformed lines */ }
        }
    }
}
```

- [ ] **Step 4: Create chat.js router**

```js
// src/endpoints/world-simulation/chat.js
import express from 'express';
import { streamLLM } from './llm-client.js';

export const router = express.Router();

// POST /:worldId — stream chat response as SSE
router.post('/:worldId', async (req, res) => {
    const { systemPrompt, messages, apiConfig = {} } = req.body;
    if (!systemPrompt || !messages) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        await streamLLM(messages, systemPrompt, apiConfig, (delta) => {
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        });
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
    res.end();
});
```

- [ ] **Step 5: Mount chat router in index.js**

Add to `src/endpoints/world-simulation/index.js`:
```js
import { router as chatRouter } from './chat.js';
// ...after existing imports
router.use('/chat', chatRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm run test:ws -- --testPathPattern=chat
```
Expected: 3 passed

- [ ] **Step 7: Run full backend test suite to verify no regressions**

```bash
npm run test:ws
```
Expected: all passing (52+ tests)

- [ ] **Step 8: Commit**

```bash
git add src/endpoints/world-simulation/llm-client.js src/endpoints/world-simulation/chat.js src/endpoints/world-simulation/index.js tests/world-simulation/chat.test.js
git commit -m "feat(world-sim): add SSE streaming chat endpoint"
```

---

## Task 2: Frontend API Layer (chat, player, scenes, events)

**Files:**
- Create: `frontend/src/api/chat.js`
- Create: `frontend/src/api/player.js`
- Create: `frontend/src/api/scenes.js`
- Create: `frontend/src/api/events.js`
- Test: `frontend/src/__tests__/api/chat.test.js`
- Test: `frontend/src/__tests__/api/player.test.js`
- Test: `frontend/src/__tests__/api/scenes.test.js`
- Test: `frontend/src/__tests__/api/events.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// frontend/src/__tests__/api/chat.test.js
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
```

```js
// frontend/src/__tests__/api/player.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playerApi } from '../../api/player.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('getPlayer fetches GET /player/:worldId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'Hero' }) });
  const result = await playerApi.get('w1');
  expect(result.name).toBe('Hero');
  expect(global.fetch).toHaveBeenCalledWith('/api/world-sim/player/w1', expect.any(Object));
});

it('updateStatus PATCHes /player/:worldId/status', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ name: 'Hero' }) });
  await playerApi.updateStatus('w1', { health: 80 });
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/player/w1/status',
    expect.objectContaining({ method: 'PATCH' })
  );
});

it('deleteItem DELETEs /player/:worldId/inventory/:itemId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  await playerApi.deleteItem('w1', 'item1');
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/player/w1/inventory/item1',
    expect.objectContaining({ method: 'DELETE' })
  );
});
```

```js
// frontend/src/__tests__/api/scenes.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scenesApi } from '../../api/scenes.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('list fetches GET /scenes/:worldId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scenes: [] }) });
  const result = await scenesApi.list('w1');
  expect(result.scenes).toEqual([]);
});

it('enterScene POSTs /scenes/:worldId/:sceneId/enter', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ scene: {} }) });
  await scenesApi.enterScene('w1', 's1');
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/scenes/w1/s1/enter',
    expect.objectContaining({ method: 'POST' })
  );
});
```

```js
// frontend/src/__tests__/api/events.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventsApi } from '../../api/events.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('confirmEvent POSTs /events/:worldId', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  await eventsApi.confirm('w1', { id: 'e1', title: 'Battle' });
  expect(global.fetch).toHaveBeenCalledWith(
    '/api/world-sim/events/w1',
    expect.objectContaining({ method: 'POST' })
  );
});

it('proposeEvent POSTs /events/:worldId/propose', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: null }) });
  const result = await eventsApi.propose('w1', [], {});
  expect(result.proposal).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|chat|player|scenes|events)"
```
Expected: FAIL — modules not found

- [ ] **Step 3: Implement api/chat.js**

```js
// frontend/src/api/chat.js
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
```

- [ ] **Step 4: Implement api/player.js**

```js
// frontend/src/api/player.js
import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/player/${worldId}`;

export const playerApi = {
    get: (worldId) => apiFetch(BASE(worldId)),
    update: (worldId, player) => apiFetch(BASE(worldId), { method: 'PUT', body: JSON.stringify(player) }),
    updateStatus: (worldId, status) =>
        apiFetch(`${BASE(worldId)}/status`, { method: 'PATCH', body: JSON.stringify(status) }),
    addItem: (worldId, item) =>
        apiFetch(`${BASE(worldId)}/inventory`, { method: 'POST', body: JSON.stringify(item) }),
    deleteItem: (worldId, itemId) =>
        apiFetch(`${BASE(worldId)}/inventory/${itemId}`, { method: 'DELETE' }),
};
```

- [ ] **Step 5: Implement api/scenes.js**

```js
// frontend/src/api/scenes.js
import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/scenes/${worldId}`;

export const scenesApi = {
    list: (worldId) => apiFetch(BASE(worldId)),
    enterScene: (worldId, sceneId) =>
        apiFetch(`${BASE(worldId)}/${sceneId}/enter`, { method: 'POST', body: JSON.stringify({}) }),
};
```

- [ ] **Step 6: Implement api/events.js**

```js
// frontend/src/api/events.js
import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/events/${worldId}`;

export const eventsApi = {
    list: (worldId) => apiFetch(BASE(worldId)),
    confirm: (worldId, event) =>
        apiFetch(BASE(worldId), { method: 'POST', body: JSON.stringify(event) }),
    delete: (worldId, eventId) =>
        apiFetch(`${BASE(worldId)}/${eventId}`, { method: 'DELETE' }),
    propose: (worldId, chatHistory, apiConfig) =>
        apiFetch(`${BASE(worldId)}/propose`, {
            method: 'POST',
            body: JSON.stringify({ chatHistory, apiConfig }),
        }),
};
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|chat|player|scenes|events)"
```
Expected: all new API tests pass

- [ ] **Step 8: Run full frontend test suite**

```bash
cd frontend && npm test
```
Expected: all 29+ tests pass

- [ ] **Step 9: Commit**

```bash
git add frontend/src/api/chat.js frontend/src/api/player.js frontend/src/api/scenes.js frontend/src/api/events.js frontend/src/__tests__/api/
git commit -m "feat(world-sim): add frontend API layer for chat, player, scenes, events"
```

---

## Task 3: ChatPane Component

**Files:**
- Create: `frontend/src/components/chat/ChatPane.jsx`
- Test: `frontend/src/__tests__/components/chat/ChatPane.test.jsx`

`ChatPane` owns: message list, streaming append, input box, send button, and fires `onTurnComplete` after each AI reply (for propose trigger).

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/__tests__/components/chat/ChatPane.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ChatPane from '../../../components/chat/ChatPane.jsx';
import * as chatApiModule from '../../../api/chat.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

function renderPane(props = {}) {
  return render(
    <MemoryRouter>
      <ChatPane worldId="w1" worldData={{}} playerStatus={{}} narrativeMode="ensemble" {...props} />
    </MemoryRouter>
  );
}

it('shows empty message list initially', () => {
  renderPane();
  expect(screen.queryByRole('list')).toBeInTheDocument();
  // no messages yet
  expect(screen.queryAllByRole('listitem')).toHaveLength(0);
});

it('sends a message and appends it to the list', async () => {
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDelta, onDone }) => {
    onDelta('The world trembles.');
    onDone();
  });
  renderPane();
  await userEvent.type(screen.getByRole('textbox'), 'What happens?');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(screen.getByText('What happens?')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByText(/The world trembles/)).toBeInTheDocument());
});

it('disables send button while streaming', async () => {
  let resolveDone;
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDone }) => {
    await new Promise((res) => { resolveDone = res; });
    onDone();
  });
  renderPane();
  await userEvent.type(screen.getByRole('textbox'), 'hi');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  expect(screen.getByRole('button', { name: /发送/ })).toBeDisabled();
  resolveDone();
  await waitFor(() => expect(screen.getByRole('button', { name: /发送/ })).not.toBeDisabled());
});

it('calls onTurnComplete after AI reply finishes', async () => {
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDelta, onDone }) => {
    onDelta('ok'); onDone();
  });
  const onTurnComplete = vi.fn();
  renderPane({ onTurnComplete });
  await userEvent.type(screen.getByRole('textbox'), 'hi');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(onTurnComplete).toHaveBeenCalledTimes(1));
});

it('clears input after sending', async () => {
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDone }) => { onDone(); });
  renderPane();
  await userEvent.type(screen.getByRole('textbox'), 'hello');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- ChatPane
```
Expected: FAIL — component not found

- [ ] **Step 3: Implement ChatPane.jsx**

```jsx
// frontend/src/components/chat/ChatPane.jsx
import { useState, useRef, useEffect } from 'react';
import { buildContext, streamChat } from '../../api/chat.js';
import Spinner from '../ui/Spinner.jsx';

export default function ChatPane({ worldId, worldData, playerStatus, narrativeMode, onTurnComplete }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setStreaming(true);

    const chatHistory = [...messages, userMsg];
    // Use a ref to accumulate streaming text safely across async callbacks
    // (avoids stale-closure issues with index-based state mutations)
    const accRef = { current: '' };

    try {
      const { systemPrompt, trimmedChatHistory } = await buildContext({
        worldCard: worldData,
        chatHistory,
        tokenBudget: 4096,
        mode: narrativeMode || 'ensemble',
        playerStatus,
      });

      // Append empty assistant placeholder
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      await streamChat({
        worldId,
        systemPrompt,
        messages: trimmedChatHistory,
        apiConfig: worldData?.apiConfig || {},
        onDelta: (delta) => {
          accRef.current += delta;
          const accumulated = accRef.current;
          // Replace the last message (the assistant placeholder) with current text
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: accumulated };
            return next;
          });
        },
        onDone: () => {
          setStreaming(false);
          onTurnComplete?.();
        },
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '（发生错误，请重试）', error: true },
      ]);
      setStreaming(false);
    }
  }

  async function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ul className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <li
            key={i}
            className={`max-w-prose rounded-lg px-4 py-2 ${
              msg.role === 'user'
                ? 'ml-auto bg-blue-600 text-white'
                : msg.error
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-900'
            }`}
          >
            {msg.content}
            {msg.role === 'assistant' && streaming && !msg.content && (
              <Spinner />
            )}
          </li>
        ))}
        <div ref={bottomRef} />
      </ul>
      <div className="border-t p-3 flex gap-2">
        <textarea
          className="flex-1 resize-none rounded border p-2 text-sm"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息…"
          disabled={streaming}
        />
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          onClick={handleSend}
          disabled={streaming || !input.trim()}
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- ChatPane
```
Expected: 5 passed

- [ ] **Step 5: Run full frontend test suite**

```bash
cd frontend && npm test
```
Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/chat/ChatPane.jsx frontend/src/__tests__/components/chat/ChatPane.test.jsx
git commit -m "feat(world-sim): add ChatPane with SSE streaming"
```

---

## Task 4: EventProposalCard Component

**Files:**
- Create: `frontend/src/components/chat/EventProposalCard.jsx`
- Test: `frontend/src/__tests__/components/chat/EventProposalCard.test.jsx`

On accept: `confirmEvent` → `updateState` → if `affected_characters` has items also `addItem` to inventory (items field). On ignore: `clearProposal`.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/__tests__/components/chat/EventProposalCard.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EventProposalCard from '../../../components/chat/EventProposalCard.jsx';
import * as eventsApiModule from '../../../api/events.js';
import * as chatApiModule from '../../../api/chat.js';

const mockProposal = {
  narrative: '冥冥中，一场风暴正在酝酿。',
  event_draft: { id: 'e1', title: 'Great Storm', description: 'A storm', impact_scope: 'major', affected_characters: [] },
};

beforeEach(() => { vi.restoreAllMocks(); });

it('displays narrative text from proposal', () => {
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={vi.fn()} />);
  expect(screen.getByText('冥冥中，一场风暴正在酝酿。')).toBeInTheDocument();
});

it('calls eventsApi.confirm then onDismiss when accepting', async () => {
  vi.spyOn(eventsApiModule.eventsApi, 'confirm').mockResolvedValue({});
  const onDismiss = vi.fn();
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={onDismiss} />);
  await userEvent.click(screen.getByRole('button', { name: /接受/ }));
  await waitFor(() => expect(eventsApiModule.eventsApi.confirm).toHaveBeenCalledWith('w1', mockProposal.event_draft));
  await waitFor(() => expect(onDismiss).toHaveBeenCalled());
});

it('calls onDismiss immediately when ignoring', async () => {
  const onDismiss = vi.fn();
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={onDismiss} />);
  await userEvent.click(screen.getByRole('button', { name: /忽略/ }));
  expect(onDismiss).toHaveBeenCalled();
});

it('disables buttons while accepting', async () => {
  let resolve;
  vi.spyOn(eventsApiModule.eventsApi, 'confirm').mockImplementation(
    () => new Promise((r) => { resolve = r; })
  );
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: /接受/ }));
  expect(screen.getByRole('button', { name: /接受/ })).toBeDisabled();
  resolve({});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- EventProposalCard
```

- [ ] **Step 3: Implement EventProposalCard.jsx**

```jsx
// frontend/src/components/chat/EventProposalCard.jsx
import { useState } from 'react';
import { eventsApi } from '../../api/events.js';

export default function EventProposalCard({ worldId, proposal, onDismiss }) {
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    setAccepting(true);
    try {
      await eventsApi.confirm(worldId, proposal.event_draft);
      onDismiss();
    } catch {
      setAccepting(false);
    }
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm shadow">
      <p className="text-amber-800 italic mb-3">{proposal.narrative}</p>
      <p className="font-semibold text-gray-800 mb-1">{proposal.event_draft.title}</p>
      <p className="text-gray-600 text-xs mb-3">{proposal.event_draft.description}</p>
      <div className="flex gap-2 justify-end">
        <button
          className="px-3 py-1 rounded border text-sm disabled:opacity-50"
          onClick={onDismiss}
          disabled={accepting}
        >
          忽略
        </button>
        <button
          className="px-3 py-1 rounded bg-amber-500 text-white text-sm disabled:opacity-50"
          onClick={handleAccept}
          disabled={accepting}
        >
          接受
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- EventProposalCard
```
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/EventProposalCard.jsx frontend/src/__tests__/components/chat/EventProposalCard.test.jsx
git commit -m "feat(world-sim): add EventProposalCard component"
```

---

## Task 5: Three RPG Overlay Panels

**Files:**
- Create: `frontend/src/components/panels/MapPanel.jsx`
- Create: `frontend/src/components/panels/PlayerProfilePanel.jsx`
- Create: `frontend/src/components/panels/InventoryPanel.jsx`
- Test: `frontend/src/__tests__/components/panels/MapPanel.test.jsx`
- Test: `frontend/src/__tests__/components/panels/PlayerProfilePanel.test.jsx`
- Test: `frontend/src/__tests__/components/panels/InventoryPanel.test.jsx`

All panels are slide-over overlays: fixed right-side panel, backdrop click to close, independent data fetch on mount.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/__tests__/components/panels/MapPanel.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MapPanel from '../../../components/panels/MapPanel.jsx';
import * as scenesApiModule from '../../../api/scenes.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('lists scenes after loading', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [
      { id: 's1', name: 'Capital', is_locked: false },
      { id: 's2', name: 'Forbidden City', is_locked: true, unlock_condition: 'Reach level 5' },
    ],
  });
  render(<MapPanel worldId="w1" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Capital')).toBeInTheDocument());
  expect(screen.getByText('Forbidden City')).toBeInTheDocument();
});

it('greyes out locked scene and shows tooltip', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [{ id: 's2', name: 'Forbidden City', is_locked: true, unlock_condition: 'Reach level 5' }],
  });
  render(<MapPanel worldId="w1" onClose={vi.fn()} />);
  await waitFor(() => screen.getByText('Forbidden City'));
  expect(screen.getByTitle('Reach level 5')).toBeInTheDocument();
});

it('calls enterScene and onClose when clicking an unlocked scene', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [{ id: 's1', name: 'Capital', is_locked: false }],
  });
  vi.spyOn(scenesApiModule.scenesApi, 'enterScene').mockResolvedValue({ scene: {} });
  const onClose = vi.fn();
  render(<MapPanel worldId="w1" onClose={onClose} />);
  await userEvent.click(await screen.findByText('Capital'));
  await waitFor(() => expect(scenesApiModule.scenesApi.enterScene).toHaveBeenCalledWith('w1', 's1'));
  expect(onClose).toHaveBeenCalled();
});
```

```jsx
// frontend/src/__tests__/components/panels/PlayerProfilePanel.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerProfilePanel from '../../../components/panels/PlayerProfilePanel.jsx';
import * as playerApiModule from '../../../api/player.js';

const mockPlayer = {
  name: 'Hero', status: { health: 90, mental: 75, reputation: 60, current_location: 's1' },
};

beforeEach(() => { vi.restoreAllMocks(); });

it('shows player status fields', async () => {
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  render(<PlayerProfilePanel worldId="w1" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Hero')).toBeInTheDocument());
  expect(screen.getByDisplayValue('90')).toBeInTheDocument(); // health
});

it('calls updateStatus when saving changes', async () => {
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(playerApiModule.playerApi, 'updateStatus').mockResolvedValue(mockPlayer);
  render(<PlayerProfilePanel worldId="w1" onClose={vi.fn()} />);
  const healthInput = await screen.findByDisplayValue('90');
  await userEvent.clear(healthInput);
  await userEvent.type(healthInput, '85');
  await userEvent.click(screen.getByRole('button', { name: /保存/ }));
  await waitFor(() =>
    expect(playerApiModule.playerApi.updateStatus).toHaveBeenCalledWith('w1', expect.objectContaining({ health: 85 }))
  );
});
```

```jsx
// frontend/src/__tests__/components/panels/InventoryPanel.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPanel from '../../../components/panels/InventoryPanel.jsx';
import * as playerApiModule from '../../../api/player.js';

const mockPlayer = {
  name: 'Hero',
  inventory: [
    { id: 'i1', name: 'Sword of Dawn', description: 'A gleaming blade', source_event: 'Battle of Iron Keep' },
  ],
};

beforeEach(() => { vi.restoreAllMocks(); });

it('lists inventory items', async () => {
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  render(<InventoryPanel worldId="w1" onClose={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Sword of Dawn')).toBeInTheDocument());
  expect(screen.getByText('Battle of Iron Keep')).toBeInTheDocument();
});

it('calls deleteItem when clicking delete', async () => {
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(playerApiModule.playerApi, 'deleteItem').mockResolvedValue({});
  render(<InventoryPanel worldId="w1" onClose={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: /删除/ }));
  await waitFor(() =>
    expect(playerApiModule.playerApi.deleteItem).toHaveBeenCalledWith('w1', 'i1')
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- "MapPanel|PlayerProfilePanel|InventoryPanel"
```

- [ ] **Step 3: Implement MapPanel.jsx**

```jsx
// frontend/src/components/panels/MapPanel.jsx
import { useState, useEffect } from 'react';
import { scenesApi } from '../../api/scenes.js';
import Spinner from '../ui/Spinner.jsx';

export default function MapPanel({ worldId, onClose }) {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    scenesApi.list(worldId)
      .then((data) => setScenes(data.scenes || []))
      .finally(() => setLoading(false));
  }, [worldId]);

  async function handleEnter(scene) {
    if (scene.is_locked) return;
    await scenesApi.enterScene(worldId, scene.id);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-80 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">地图</h2>
          <button onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? <Spinner /> : (
            <ul className="space-y-2">
              {scenes.map((scene) => (
                <li key={scene.id}>
                  <button
                    className={`w-full text-left px-3 py-2 rounded border ${
                      scene.is_locked
                        ? 'opacity-40 cursor-not-allowed border-gray-200 text-gray-500'
                        : 'hover:bg-blue-50 border-gray-200'
                    }`}
                    title={scene.is_locked ? scene.unlock_condition : undefined}
                    onClick={() => handleEnter(scene)}
                    disabled={scene.is_locked}
                  >
                    {scene.name}
                    {scene.is_locked && <span className="ml-2 text-xs">🔒</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 4: Implement PlayerProfilePanel.jsx**

```jsx
// frontend/src/components/panels/PlayerProfilePanel.jsx
import { useState, useEffect } from 'react';
import { playerApi } from '../../api/player.js';
import Spinner from '../ui/Spinner.jsx';

export default function PlayerProfilePanel({ worldId, onClose }) {
  const [player, setPlayer] = useState(null);
  const [status, setStatus] = useState({ health: 0, mental: 0, reputation: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    playerApi.get(worldId).then((p) => {
      setPlayer(p);
      setStatus({ health: p.status?.health ?? 0, mental: p.status?.mental ?? 0, reputation: p.status?.reputation ?? 0 });
    });
  }, [worldId]);

  async function handleSave() {
    setSaving(true);
    try {
      await playerApi.updateStatus(worldId, status);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-80 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">角色状态</h2>
          <button onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!player ? <Spinner /> : (
            <div className="space-y-4">
              <p className="font-semibold text-xl">{player.name}</p>
              {['health', 'mental', 'reputation'].map((field) => (
                <label key={field} className="block text-sm">
                  <span className="capitalize text-gray-600">
                    {{ health: '生命值', mental: '精神值', reputation: '声望' }[field]}
                  </span>
                  <input
                    type="number"
                    min={0} max={100}
                    className="mt-1 block w-full border rounded px-2 py-1"
                    value={status[field]}
                    onChange={(e) => setStatus((s) => ({ ...s, [field]: Number(e.target.value) }))}
                  />
                </label>
              ))}
              <button
                className="w-full py-2 bg-blue-600 text-white rounded disabled:opacity-50"
                onClick={handleSave}
                disabled={saving}
              >
                保存
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 5: Implement InventoryPanel.jsx**

```jsx
// frontend/src/components/panels/InventoryPanel.jsx
import { useState, useEffect } from 'react';
import { playerApi } from '../../api/player.js';
import Spinner from '../ui/Spinner.jsx';

export default function InventoryPanel({ worldId, onClose }) {
  const [inventory, setInventory] = useState(null);

  useEffect(() => {
    playerApi.get(worldId).then((p) => setInventory(p.inventory || []));
  }, [worldId]);

  async function handleDelete(itemId) {
    await playerApi.deleteItem(worldId, itemId);
    setInventory((prev) => prev.filter((i) => i.id !== itemId));
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-80 bg-white h-full shadow-xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">背包</h2>
          <button onClick={onClose} aria-label="关闭">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {!inventory ? <Spinner /> : inventory.length === 0 ? (
            <p className="text-gray-400 text-sm">背包是空的</p>
          ) : (
            <ul className="space-y-3">
              {inventory.map((item) => (
                <li key={item.id} className="border rounded p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                      {item.source_event && <p className="text-xs text-amber-600 mt-1">{item.source_event}</p>}
                    </div>
                    <button
                      className="text-red-500 text-xs hover:text-red-700 shrink-0"
                      onClick={() => handleDelete(item.id)}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd frontend && npm test -- "MapPanel|PlayerProfilePanel|InventoryPanel"
```
Expected: 7 passed across 3 files

- [ ] **Step 7: Run full frontend test suite**

```bash
cd frontend && npm test
```
Expected: all passing

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/panels/ frontend/src/__tests__/components/panels/
git commit -m "feat(world-sim): add Map, PlayerProfile, Inventory overlay panels"
```

---

## Task 6: WorldPage — Full Implementation

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`
- Test: `frontend/src/__tests__/pages/WorldPage.test.jsx`

WorldPage is the orchestration layer: loads world + characters + player on mount, wires ChatPane + EventProposalCard + panels, handles narrative mode selection, drives the propose cycle via `eventStore`.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/__tests__/pages/WorldPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorldPage from '../../pages/WorldPage.jsx';
import * as worldsApiModule from '../../api/worlds.js';
import * as playerApiModule from '../../api/player.js';
import * as eventsApiModule from '../../api/events.js';
import * as chatApiModule from '../../api/chat.js';
import { useEventStore } from '../../stores/eventStore.js';

const mockWorld = {
  id: 'w1', name: 'Iron Fog',
  foundation: { background: 'A dark city' },
  current_state: { summary: 'All is well' },
};
const mockPlayer = {
  name: 'Hero', status: { health: 100, mental: 80, reputation: 50 },
  inventory: [],
};

beforeEach(() => {
  vi.restoreAllMocks();
  // Reset Zustand event store so turn-counter tests are not order-dependent
  useEventStore.setState({ turnsSinceLastPropose: 0, pendingProposal: null, proposing: false });
});

function renderPage() {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  return render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes>
        <Route path="/world/:worldId" element={<WorldPage />} />
      </Routes>
    </MemoryRouter>
  );
}

it('shows world name in top bar after loading', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Iron Fog')).toBeInTheDocument());
});

it('renders narrative mode selector with ensemble as default', async () => {
  renderPage();
  await waitFor(() => screen.getByText('Iron Fog'));
  expect(screen.getByRole('combobox')).toHaveValue('ensemble');
});

it('shows map panel when clicking map button', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  const { unmount } = render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes>
        <Route path="/world/:worldId" element={<WorldPage />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => screen.getByText('Iron Fog'));
  await userEvent.click(screen.getByRole('button', { name: /地图/ }));
  expect(screen.getByText('地图')).toBeInTheDocument();
  unmount();
});

it('shows event proposal card when pendingProposal is set via onTurnComplete', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDelta, onDone }) => {
    onDelta('ok'); onDone();
  });
  vi.spyOn(eventsApiModule.eventsApi, 'propose').mockResolvedValue({
    proposal: {
      narrative: '冥冥中，风暴来临。',
      event_draft: { id: 'e1', title: 'Storm', description: 'A big storm', impact_scope: 'major', affected_characters: [] },
    },
  });

  const { unmount } = render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes>
        <Route path="/world/:worldId" element={<WorldPage />} />
      </Routes>
    </MemoryRouter>
  );
  await waitFor(() => screen.getByText('Iron Fog'));

  // Force eventStore to shouldPropose by sending 3 turns
  // Simulate sending a message (ChatPane handles it, but we need to trigger onTurnComplete)
  // For this test, directly mock the propose call by manipulating the turns counter
  // We spy on the propose call — it's triggered after 3 turns
  // Send one message (mocked to complete immediately)
  const input = screen.getByRole('textbox');
  await userEvent.type(input, 'Turn 1');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => screen.getByRole('textbox')); // wait for streaming to complete

  // Manually repeat to get to 3 turns
  await userEvent.type(input, 'Turn 2');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => screen.getByRole('textbox'));

  await userEvent.type(input, 'Turn 3');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));

  await waitFor(() => expect(screen.getByText(/冥冥中，风暴来临。/)).toBeInTheDocument(), { timeout: 3000 });
  unmount();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- WorldPage
```
Expected: FAIL — skeleton renders nothing useful

- [ ] **Step 3: Implement WorldPage.jsx**

```jsx
// frontend/src/pages/WorldPage.jsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { playerApi } from '../api/player.js';
import { eventsApi } from '../api/events.js';
import { useEventStore } from '../stores/eventStore.js';
import { useWorldStore } from '../stores/worldStore.js';
import ChatPane from '../components/chat/ChatPane.jsx';
import EventProposalCard from '../components/chat/EventProposalCard.jsx';
import MapPanel from '../components/panels/MapPanel.jsx';
import PlayerProfilePanel from '../components/panels/PlayerProfilePanel.jsx';
import InventoryPanel from '../components/panels/InventoryPanel.jsx';
import Spinner from '../components/ui/Spinner.jsx';

const NARRATIVE_MODES = [
  { value: 'intimate', label: '亲密 (50% 对话)' },
  { value: 'ensemble', label: '群像 (35% 对话)' },
  { value: 'epic', label: '史诗 (25% 对话)' },
];

export default function WorldPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const [world, setWorld] = useState(null);
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showInventory, setShowInventory] = useState(false);

  const { narrativeMode, setNarrativeMode } = useWorldStore();
  const {
    pendingProposal, setPendingProposal, clearProposal,
    incrementTurns, setProposing, shouldPropose,
  } = useEventStore();

  useEffect(() => {
    Promise.all([
      worldsApi.get(worldId),
      playerApi.get(worldId).catch(() => null),
      eventsApi.list(worldId).catch(() => ({ events: [] })),
    ]).then(([w, p]) => {
      setWorld(w);
      setPlayer(p);
    }).finally(() => setLoading(false));
  }, [worldId]);

  const handleTurnComplete = useCallback(async () => {
    incrementTurns();
    if (!shouldPropose()) return;
    setProposing(true);
    try {
      const result = await eventsApi.propose(worldId, [], {});
      if (result.proposal) {
        setPendingProposal(result.proposal);
      }
    } finally {
      setProposing(false);
    }
  }, [worldId, incrementTurns, shouldPropose, setProposing, setPendingProposal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-white shadow-sm">
        <h1 className="text-lg font-semibold flex-1">{world?.name}</h1>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={narrativeMode}
          onChange={(e) => setNarrativeMode(e.target.value)}
        >
          {NARRATIVE_MODES.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        <Link
          to={`/world/${worldId}/archive`}
          className="text-sm text-blue-600 hover:underline"
        >
          世界档案
        </Link>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-56 border-r bg-white flex flex-col py-3 px-2 gap-2">
          <p className="text-xs text-gray-500 uppercase px-2">当前场景</p>
          <p className="text-sm px-2 truncate">{player?.status?.current_location || '未知'}</p>
          <div className="flex-1" />
          <div className="flex gap-1 px-1">
            <button
              className="flex-1 py-2 text-lg rounded hover:bg-gray-100"
              onClick={() => setShowMap(true)}
              title="地图"
              aria-label="地图"
            >🗺</button>
            <button
              className="flex-1 py-2 text-lg rounded hover:bg-gray-100"
              onClick={() => setShowProfile(true)}
              title="角色状态"
              aria-label="角色状态"
            >👤</button>
            <button
              className="flex-1 py-2 text-lg rounded hover:bg-gray-100"
              onClick={() => setShowInventory(true)}
              title="背包"
              aria-label="背包"
            >🎒</button>
          </div>
        </aside>

        {/* Chat pane */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          <ChatPane
            worldId={worldId}
            worldData={world}
            playerStatus={player?.status}
            narrativeMode={narrativeMode}
            onTurnComplete={handleTurnComplete}
          />
          {pendingProposal && (
            <div className="absolute bottom-20 left-0 right-0 px-3">
              <EventProposalCard
                worldId={worldId}
                proposal={pendingProposal}
                onDismiss={clearProposal}
              />
            </div>
          )}
        </div>
      </div>

      {/* Overlay panels */}
      {showMap && <MapPanel worldId={worldId} onClose={() => setShowMap(false)} />}
      {showProfile && <PlayerProfilePanel worldId={worldId} onClose={() => setShowProfile(false)} />}
      {showInventory && <InventoryPanel worldId={worldId} onClose={() => setShowInventory(false)} />}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- WorldPage
```
Expected: 4 passed

- [ ] **Step 5: Run full frontend test suite**

```bash
cd frontend && npm test
```
Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/WorldPage.jsx frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "feat(world-sim): implement WorldPage with chat, panels, event proposal"
```

---

## Task 7: WorldArchivePage

**Files:**
- Create: `frontend/src/pages/WorldArchivePage.jsx`
- Modify: `frontend/src/App.jsx`
- Test: `frontend/src/__tests__/pages/WorldArchivePage.test.jsx`

Shows: current_state summary, event timeline (with delete), character list, scenes list. All data fetched on mount from existing API modules.

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/__tests__/pages/WorldArchivePage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import WorldArchivePage from '../../pages/WorldArchivePage.jsx';
import * as worldsApiModule from '../../api/worlds.js';
import * as eventsApiModule from '../../api/events.js';
import * as charactersApiModule from '../../api/characters.js';
import * as scenesApiModule from '../../api/scenes.js';

const mockWorld = {
  id: 'w1', name: 'Iron Fog',
  foundation: { background: 'A dark city' },
  power_system: { description: 'Cultivation levels' },
  current_state: { summary: 'The fog thickens.' },
};

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage() {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({
    events: [{ id: 'e1', title: 'The Siege', description: 'City under attack', impact_scope: 'major' }],
  });
  vi.spyOn(charactersApiModule.charactersApi, 'list').mockResolvedValue([
    { id: 'c1', name: 'Ada', world_id: 'w1' },
  ]);
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [{ id: 's1', name: 'Capital' }],
  });
  return render(
    <MemoryRouter initialEntries={['/world/w1/archive']}>
      <Routes>
        <Route path="/world/:worldId/archive" element={<WorldArchivePage />} />
      </Routes>
    </MemoryRouter>
  );
}

it('shows world name and current state summary', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Iron Fog')).toBeInTheDocument());
  expect(screen.getByText('The fog thickens.')).toBeInTheDocument();
});

it('lists events in timeline', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('The Siege')).toBeInTheDocument());
});

it('deletes an event when clicking delete', async () => {
  vi.spyOn(eventsApiModule.eventsApi, 'delete').mockResolvedValue({});
  renderPage();
  await waitFor(() => screen.getByText('The Siege'));
  await userEvent.click(screen.getByRole('button', { name: /删除事件/ }));
  await waitFor(() => expect(eventsApiModule.eventsApi.delete).toHaveBeenCalledWith('w1', 'e1'));
  expect(screen.queryByText('The Siege')).not.toBeInTheDocument();
});

it('lists characters', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Ada')).toBeInTheDocument());
});

it('lists scenes', async () => {
  renderPage();
  await waitFor(() => expect(screen.getByText('Capital')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- WorldArchivePage
```

- [ ] **Step 3: Implement WorldArchivePage.jsx**

```jsx
// frontend/src/pages/WorldArchivePage.jsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { eventsApi } from '../api/events.js';
import { charactersApi } from '../api/characters.js';
import { scenesApi } from '../api/scenes.js';
import Spinner from '../components/ui/Spinner.jsx';

const IMPACT_COLORS = {
  minor: 'bg-gray-100 text-gray-600',
  moderate: 'bg-blue-100 text-blue-700',
  major: 'bg-red-100 text-red-700',
};

export default function WorldArchivePage() {
  const { worldId } = useParams();
  const [world, setWorld] = useState(null);
  const [events, setEvents] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      worldsApi.get(worldId),
      eventsApi.list(worldId),
      charactersApi.list(worldId),
      scenesApi.list(worldId),
    ]).then(([w, e, c, s]) => {
      setWorld(w);
      setEvents(e.events || []);
      setCharacters(c);
      setScenes(s.scenes || []);
    }).finally(() => setLoading(false));
  }, [worldId]);

  async function handleDeleteEvent(eventId) {
    await eventsApi.delete(worldId, eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner /></div>;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
      <div className="flex items-center gap-3">
        <Link to={`/world/${worldId}`} className="text-blue-600 hover:underline text-sm">← 返回游戏</Link>
        <h1 className="text-2xl font-bold">{world?.name} — 世界档案</h1>
      </div>

      {/* Current State */}
      <section>
        <h2 className="text-lg font-semibold mb-2">当前状态</h2>
        <p className="text-gray-700 bg-gray-50 rounded p-3">{world?.current_state?.summary || '暂无记录'}</p>
      </section>

      {/* Event Timeline */}
      <section>
        <h2 className="text-lg font-semibold mb-2">事件时间线</h2>
        {events.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无事件</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="flex items-start gap-3 border rounded p-3">
                <span className={`text-xs px-2 py-0.5 rounded-full mt-0.5 shrink-0 ${IMPACT_COLORS[event.impact_scope] || IMPACT_COLORS.moderate}`}>
                  {event.impact_scope}
                </span>
                <div className="flex-1">
                  <p className="font-medium">{event.title}</p>
                  <p className="text-sm text-gray-600">{event.description}</p>
                </div>
                <button
                  className="text-xs text-red-500 hover:text-red-700 shrink-0"
                  onClick={() => handleDeleteEvent(event.id)}
                  aria-label="删除事件"
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Characters */}
      <section>
        <h2 className="text-lg font-semibold mb-2">角色列表</h2>
        {characters.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无角色</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {characters.map((c) => (
              <li key={c.id} className="border rounded p-2 text-sm">{c.name}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Scenes */}
      <section>
        <h2 className="text-lg font-semibold mb-2">场景列表</h2>
        {scenes.length === 0 ? (
          <p className="text-gray-400 text-sm">暂无场景</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {scenes.map((s) => (
              <li key={s.id} className="border rounded p-2 text-sm">
                {s.name}
                {s.is_locked && <span className="ml-1 text-xs text-gray-400">🔒</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Add route to App.jsx**

In `frontend/src/App.jsx`, add the import and route:
```jsx
import WorldArchivePage from './pages/WorldArchivePage.jsx';
// inside <Routes>:
<Route path="/world/:worldId/archive" element={<WorldArchivePage />} />
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npm test -- WorldArchivePage
```
Expected: 5 passed

- [ ] **Step 6: Run full test suites**

```bash
npm run test:ws && cd frontend && npm test
```
Expected: all passing (52+ backend, 50+ frontend)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/WorldArchivePage.jsx frontend/src/__tests__/pages/WorldArchivePage.test.jsx frontend/src/App.jsx
git commit -m "feat(world-sim): add WorldArchivePage with events, characters, scenes"
```

---

## Summary

| Task | New files | Tests added |
|------|-----------|-------------|
| 1 — Chat backend SSE | `chat.js`, `llm-client.js` (modified) | 3 Jest |
| 2 — Frontend API layer | `chat.js`, `player.js`, `scenes.js`, `events.js` | ~12 Vitest |
| 3 — ChatPane | `ChatPane.jsx` | 5 Vitest |
| 4 — EventProposalCard | `EventProposalCard.jsx` | 4 Vitest |
| 5 — Overlay panels | `MapPanel.jsx`, `PlayerProfilePanel.jsx`, `InventoryPanel.jsx` | 7 Vitest |
| 6 — WorldPage | `WorldPage.jsx` (full) | 4 Vitest |
| 7 — WorldArchivePage | `WorldArchivePage.jsx` | 5 Vitest |

**Total new tests:** ~40 (3 Jest + ~37 Vitest)
