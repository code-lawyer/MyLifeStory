# P0–P2 Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all P0 blockers (SettingsPage, player init, scene init), P1 issues (chat persistence, event proposal chatHistory, multi-character selection), and P2 polish (scene unlock on confirm, token budget from settings).

**Architecture:** Settings are stored in localStorage and exposed via a Zustand store (`settingsStore`). Chat messages are migrated from ChatPane local state to the existing `chatStore` so WorldPage can access them for event proposal. All eight tasks are independent once Task 1 (settings store) is written, since later tasks only read from it.

**Tech Stack:** React 18, Zustand 4, Tailwind CSS 3, Vitest + @testing-library/react, Node.js ESM, Express 4, Jest (backend tests in `tests/world-simulation/`).

**Test commands:**
- Backend: `npm run test:ws` (from repo root)
- Frontend: `cd frontend && npm test -- --run` (or `npm test` for watch)

---

## File Map

**New files:**
- `frontend/src/stores/settingsStore.js` — localStorage-backed Zustand store with `apiUrl`, `apiKey`, `model`, `tokenBudget`
- `frontend/src/pages/SettingsPage.jsx` — form to edit and save settings
- `frontend/src/__tests__/pages/SettingsPage.test.jsx`
- `frontend/src/components/world/InitPlayerModal.jsx` — modal to create player profile on first entry
- `frontend/src/__tests__/components/world/InitPlayerModal.test.jsx`
- `frontend/src/components/world/InitScenesModal.jsx` — modal to create first scene when world has none
- `frontend/src/__tests__/components/world/InitScenesModal.test.jsx`
- `frontend/src/components/world/CharacterSelector.jsx` — sidebar checkbox list to pick active characters
- `frontend/src/__tests__/components/world/CharacterSelector.test.jsx`

**Modified files:**
- `frontend/src/components/chat/ChatPane.jsx` — use `chatStore` instead of local messages/streaming state; accept `tokenBudget` and `characters`/`activeCharacters` from props
- `frontend/src/__tests__/components/chat/ChatPane.test.jsx` — reset chatStore in beforeEach
- `frontend/src/pages/WorldPage.jsx` — load characters, show init modals when player/scenes absent, pass messages to propose, read settings from store
- `frontend/src/__tests__/pages/WorldPage.test.jsx` — mock settings store, test persistence and init flows
- `frontend/src/api/characters.js` — add `listByWorld(worldId)` helper (filters by worldId)
- `src/endpoints/world-simulation/events.js` — POST /:worldId: after appending event, unlock matching scenes

---

## Task 1: Settings Store + SettingsPage

**Purpose:** Provide `apiConfig` (apiUrl/apiKey/model) and `tokenBudget` to the entire app via localStorage. Required by Task 2 (apiConfig propagation) and Task 8 (token budget).

**Files:**
- Create: `frontend/src/stores/settingsStore.js`
- Create: `frontend/src/pages/SettingsPage.jsx`
- Create: `frontend/src/__tests__/pages/SettingsPage.test.jsx`

---

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/pages/SettingsPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../../pages/SettingsPage.jsx';
import { useSettingsStore } from '../../stores/settingsStore.js';

beforeEach(() => {
  localStorage.clear();
  useSettingsStore.setState({
    apiUrl: '', apiKey: '', model: '', tokenBudget: 4096,
  });
  vi.restoreAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>);
}

it('renders all four input fields', () => {
  renderPage();
  expect(screen.getByLabelText(/API URL/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/模型/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Token 预算/i)).toBeInTheDocument();
});

it('saves settings to store and localStorage on submit', async () => {
  renderPage();
  await userEvent.clear(screen.getByLabelText(/API URL/i));
  await userEvent.type(screen.getByLabelText(/API URL/i), 'https://api.example.com/v1');
  await userEvent.clear(screen.getByLabelText(/API Key/i));
  await userEvent.type(screen.getByLabelText(/API Key/i), 'sk-test');
  await userEvent.clear(screen.getByLabelText(/模型/i));
  await userEvent.type(screen.getByLabelText(/模型/i), 'gpt-4o');
  await userEvent.click(screen.getByRole('button', { name: /保存/ }));
  expect(useSettingsStore.getState().apiUrl).toBe('https://api.example.com/v1');
  expect(useSettingsStore.getState().apiKey).toBe('sk-test');
  expect(useSettingsStore.getState().model).toBe('gpt-4o');
  expect(JSON.parse(localStorage.getItem('world-sim-settings')).apiKey).toBe('sk-test');
});

it('shows saved confirmation after submit', async () => {
  renderPage();
  await userEvent.click(screen.getByRole('button', { name: /保存/ }));
  expect(await screen.findByText(/已保存/)).toBeInTheDocument();
});

it('loads existing settings from localStorage on mount', () => {
  localStorage.setItem('world-sim-settings', JSON.stringify({
    apiUrl: 'https://existing.api', apiKey: 'sk-existing', model: 'claude-3', tokenBudget: 8192,
  }));
  // Re-init store from localStorage
  useSettingsStore.getState().loadFromStorage();
  renderPage();
  expect(screen.getByLabelText(/API URL/i)).toHaveValue('https://existing.api');
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
cd frontend && npm test -- --run src/__tests__/pages/SettingsPage.test.jsx
```
Expected: FAIL — "Cannot find module '../../pages/SettingsPage.jsx'"

- [ ] **Step 3: Create the settings store**

```js
// frontend/src/stores/settingsStore.js
import { create } from 'zustand';

const STORAGE_KEY = 'world-sim-settings';

function loadFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const useSettingsStore = create((set, get) => {
  const saved = loadFromLocalStorage();
  return {
    apiUrl: saved.apiUrl || '',
    apiKey: saved.apiKey || '',
    model: saved.model || '',
    tokenBudget: saved.tokenBudget || 4096,

    loadFromStorage: () => {
      const data = loadFromLocalStorage();
      set({
        apiUrl: data.apiUrl || '',
        apiKey: data.apiKey || '',
        model: data.model || '',
        tokenBudget: data.tokenBudget || 4096,
      });
    },

    save: (updates) => {
      const next = { ...get(), ...updates };
      set(updates);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          apiUrl: next.apiUrl,
          apiKey: next.apiKey,
          model: next.model,
          tokenBudget: next.tokenBudget,
        }));
      } catch { /* ignore quota errors */ }
    },

    getApiConfig: () => {
      const { apiUrl, apiKey, model } = get();
      return { apiUrl, apiKey, model };
    },
  };
});
```

- [ ] **Step 4: Create SettingsPage**

```jsx
// frontend/src/pages/SettingsPage.jsx
import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore.js';

export default function SettingsPage() {
  const { apiUrl, apiKey, model, tokenBudget, save } = useSettingsStore();
  const [form, setForm] = useState({ apiUrl, apiKey, model, tokenBudget });
  const [saved, setSaved] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'tokenBudget' ? Number(value) : value }));
    setSaved(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    save(form);
    setSaved(true);
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-xl font-semibold mb-6">设置</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span>API URL</span>
          <input
            name="apiUrl"
            value={form.apiUrl}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>API Key</span>
          <input
            type="password"
            name="apiKey"
            value={form.apiKey}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            placeholder="sk-..."
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>模型</span>
          <input
            name="model"
            value={form.model}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            placeholder="gpt-4o"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Token 预算</span>
          <input
            type="number"
            name="tokenBudget"
            value={form.tokenBudget}
            onChange={handleChange}
            className="border rounded px-3 py-2"
            min={1024}
            max={128000}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            保存
          </button>
          {saved && <span className="text-sm text-green-600">已保存</span>}
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```
cd frontend && npm test -- --run src/__tests__/pages/SettingsPage.test.jsx
```
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/settingsStore.js frontend/src/pages/SettingsPage.jsx frontend/src/__tests__/pages/SettingsPage.test.jsx
git commit -m "feat(settings): add settingsStore (localStorage) + SettingsPage UI"
```

---

## Task 2: Migrate messages to chatStore + Fix event proposal

**Purpose:** WorldPage needs to read recent chat messages to pass to `eventsApi.propose()`. Migrating ChatPane to use `chatStore` (which already exists) lets WorldPage read them directly without prop drilling.

**Files:**
- Modify: `frontend/src/components/chat/ChatPane.jsx`
- Modify: `frontend/src/__tests__/components/chat/ChatPane.test.jsx`
- Modify: `frontend/src/pages/WorldPage.jsx`
- Modify: `frontend/src/__tests__/pages/WorldPage.test.jsx`

---

- [ ] **Step 1: Update ChatPane test — add store reset in beforeEach**

In `frontend/src/__tests__/components/chat/ChatPane.test.jsx`, add the import and beforeEach reset:

```js
import { useChatStore } from '../../../stores/chatStore.js';

// Inside beforeEach (after vi.restoreAllMocks()):
useChatStore.setState({ messages: [], streaming: false, currentWorldId: null });
```

The renderPane helper also needs a `worldId` reset:
```js
// Add to renderPane after rendering:
// (This ensures store is set to worldId before test)
```

Actually no changes needed to renderPane — just the beforeEach reset. All existing test assertions remain identical since they check DOM, not store.

- [ ] **Step 2: Run existing ChatPane tests to confirm they still pass before refactor**

```
cd frontend && npm test -- --run src/__tests__/components/chat/ChatPane.test.jsx
```
Expected: all pass (baseline)

- [ ] **Step 3: Rewrite ChatPane to use chatStore**

Replace local `messages` and `streaming` state with reads/writes to `useChatStore`. The component behavior is identical; only the state location changes.

```jsx
// frontend/src/components/chat/ChatPane.jsx
import { useRef, useEffect } from 'react';
import { buildContext, streamChat } from '../../api/chat.js';
import { useChatStore } from '../../stores/chatStore.js';
import Spinner from '../ui/Spinner.jsx';

export default function ChatPane({ worldId, worldData, playerStatus, narrativeMode, onTurnComplete, tokenBudget, characters, activeCharacters }) {
  const { messages, streaming, setMessages, setStreaming, appendMessage } = useChatStore();
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleSend() {
    const inputEl = document.activeElement;
    // Read input from the textarea via ref — we use a controlled pattern via store
    // Actually, keep local input state for the input field only
    return; // placeholder — see Step 4 for full implementation
  }

  // ... (see Step 4 for full implementation)
}
```

Wait — `input` state must remain local (it's UI-only, not shared). Only `messages` and `streaming` move to the store.

- [ ] **Step 4: Implement full ChatPane with chatStore**

```jsx
// frontend/src/components/chat/ChatPane.jsx
import { useState, useRef, useEffect } from 'react';
import { buildContext, streamChat } from '../../api/chat.js';
import { useChatStore } from '../../stores/chatStore.js';
import Spinner from '../ui/Spinner.jsx';

export default function ChatPane({
  worldId, worldData, playerStatus, narrativeMode,
  onTurnComplete, tokenBudget = 4096, characters = [], activeCharacters,
}) {
  const { messages, streaming, setMessages, setStreaming } = useChatStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current && typeof bottomRef.current.scrollIntoView === 'function') {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);

    const accRef = { current: '' };

    try {
      const { systemPrompt, trimmedChatHistory } = await buildContext({
        worldCard: worldData,
        chatHistory: nextMessages,
        tokenBudget,
        mode: narrativeMode || 'ensemble',
        playerStatus,
        characters,
        activeCharacters,
      });

      setMessages([...nextMessages, { role: 'assistant', content: '' }]);

      await streamChat({
        worldId,
        systemPrompt,
        messages: trimmedChatHistory,
        apiConfig: worldData?.apiConfig || {},
        onDelta: (delta) => {
          accRef.current += delta;
          const accumulated = accRef.current;
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
      setMessages([...nextMessages, { role: 'assistant', content: '（发生错误，请重试）', error: true }]);
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
            {msg.role === 'assistant' && streaming && !msg.content && <Spinner />}
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

Note: `setMessages` is called with a function updater (like `setState`) — verify that `useChatStore`'s `setMessages` accepts both a value and an updater function. Looking at the current store:
```js
setMessages: (messages) => set({ messages }),
```
This only accepts a value. The `onDelta` handler needs to do: read current messages, update last. Fix by using `set((s) => ...)` pattern. Update the store:

```js
// frontend/src/stores/chatStore.js
import { create } from 'zustand';

export const useChatStore = create((set) => ({
  messages: [],
  streaming: false,
  currentWorldId: null,
  setMessages: (msgsOrUpdater) => set((s) => ({
    messages: typeof msgsOrUpdater === 'function' ? msgsOrUpdater(s.messages) : msgsOrUpdater,
  })),
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setStreaming: (streaming) => set({ streaming }),
  setCurrentWorldId: (id) => set({ currentWorldId: id }),
  clearMessages: () => set({ messages: [] }),
}));
```

- [ ] **Step 5: Update WorldPage to fix event proposal — pass recent messages**

In `frontend/src/pages/WorldPage.jsx`:
1. Import `useChatStore`
2. Add reset on worldId change: `useChatStore.getState().clearMessages()` in the load useEffect
3. Fix `handleTurnComplete` to read messages from store and pass to propose

```jsx
// Add import
import { useChatStore } from '../stores/chatStore.js';

// Inside WorldPage():
const { messages: chatMessages } = useChatStore();

// In useEffect (before the Promise.all):
useChatStore.getState().clearMessages();

// Fix handleTurnComplete:
const handleTurnComplete = useCallback(async () => {
  incrementTurns();
  if (!shouldPropose()) return;
  setProposing(true);
  try {
    // Pass last 10 messages (non-empty)
    const recentMessages = chatMessages.slice(-10).filter(m => m.content);
    if (recentMessages.length === 0) return;
    const result = await eventsApi.propose(worldId, recentMessages, {});
    if (result.proposal) {
      setPendingProposal(result.proposal);
    }
  } finally {
    setProposing(false);
  }
}, [worldId, chatMessages, incrementTurns, shouldPropose, setProposing, setPendingProposal]);
```

**Important:** `chatMessages` in the dependency array means `handleTurnComplete` recreates on every message. This is correct — it needs fresh data. To avoid recreating unnecessarily, use a ref for the callback:

```jsx
// Better approach — use a ref to hold latest messages
const chatMessagesRef = useRef([]);
useEffect(() => { chatMessagesRef.current = chatMessages; }, [chatMessages]);

const handleTurnComplete = useCallback(async () => {
  incrementTurns();
  if (!shouldPropose()) return;
  setProposing(true);
  try {
    const recentMessages = chatMessagesRef.current.slice(-10).filter(m => m.content);
    if (recentMessages.length === 0) return;
    const result = await eventsApi.propose(worldId, recentMessages, {});
    if (result.proposal) setPendingProposal(result.proposal);
  } finally {
    setProposing(false);
  }
}, [worldId, incrementTurns, shouldPropose, setProposing, setPendingProposal]);
```

- [ ] **Step 6: Run all ChatPane + WorldPage tests**

```
cd frontend && npm test -- --run src/__tests__/components/chat/ChatPane.test.jsx src/__tests__/pages/WorldPage.test.jsx
```
Expected: all pass

- [ ] **Step 7: Run full frontend test suite**

```
cd frontend && npm test -- --run
```
Expected: all 63+ pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/stores/chatStore.js frontend/src/components/chat/ChatPane.jsx frontend/src/__tests__/components/chat/ChatPane.test.jsx frontend/src/pages/WorldPage.jsx frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "fix(chat): migrate messages to chatStore, pass recent history to event propose"
```

---

## Task 3: Chat History Persistence (localStorage)

**Purpose:** Reload previous chat messages when returning to the same world. Uses localStorage keyed by `world-sim-chat-{worldId}`.

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`
- Modify: `frontend/src/__tests__/pages/WorldPage.test.jsx`

---

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/pages/WorldPage.test.jsx`:

```jsx
import { useChatStore } from '../../stores/chatStore.js';

// In beforeEach, add:
useChatStore.setState({ messages: [], streaming: false });
localStorage.clear();

it('restores chat history from localStorage on mount', async () => {
  const stored = [
    { role: 'user', content: 'Hello world' },
    { role: 'assistant', content: 'Greetings!' },
  ];
  localStorage.setItem('world-sim-chat-w1', JSON.stringify(stored));
  renderPage();
  await waitFor(() => screen.getByText('Iron Fog'));
  await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument());
  expect(screen.getByText('Greetings!')).toBeInTheDocument();
});

it('saves chat messages to localStorage after each message', async () => {
  vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDelta, onDone }) => {
    onDelta('reply'); onDone();
  });
  renderPage();
  await waitFor(() => screen.getByText('Iron Fog'));
  const input = screen.getByRole('textbox');
  await userEvent.type(input, 'test message');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(screen.getByText('test message')).toBeInTheDocument());
  const stored = JSON.parse(localStorage.getItem('world-sim-chat-w1') || '[]');
  expect(stored.some(m => m.content === 'test message')).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd frontend && npm test -- --run src/__tests__/pages/WorldPage.test.jsx
```
Expected: new tests FAIL

- [ ] **Step 3: Add persistence logic to WorldPage**

In `frontend/src/pages/WorldPage.jsx`:

```jsx
// Load messages from localStorage on mount (inside the useEffect, after clearMessages):
const stored = (() => {
  try { return JSON.parse(localStorage.getItem(`world-sim-chat-${worldId}`) || '[]'); }
  catch { return []; }
})();
if (stored.length > 0) {
  useChatStore.getState().setMessages(stored);
}

// Save messages on every change — add a separate useEffect:
useEffect(() => {
  if (chatMessages.length === 0) return;
  try {
    localStorage.setItem(`world-sim-chat-${worldId}`, JSON.stringify(chatMessages));
  } catch { /* ignore quota */ }
}, [worldId, chatMessages]);
```

The full mount useEffect becomes:

```jsx
useEffect(() => {
  useChatStore.getState().clearMessages();
  // Restore persisted history
  try {
    const stored = JSON.parse(localStorage.getItem(`world-sim-chat-${worldId}`) || '[]');
    if (stored.length > 0) useChatStore.getState().setMessages(stored);
  } catch { /* ignore */ }

  Promise.all([
    worldsApi.get(worldId),
    playerApi.get(worldId).catch(() => null),
    eventsApi.list(worldId).catch(() => ({ events: [] })),
  ]).then(([w, p]) => {
    setWorld(w);
    setPlayer(p);
  }).finally(() => setLoading(false));
}, [worldId]);
```

- [ ] **Step 4: Run tests**

```
cd frontend && npm test -- --run src/__tests__/pages/WorldPage.test.jsx
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WorldPage.jsx frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "feat(chat): persist chat history to localStorage per worldId"
```

---

## Task 4: Player Initialization Modal (P0)

**Purpose:** When a user enters a world with no player profile, show a modal to set their name. Without this, `player` is `null` and the sidebar shows "未知" with no way to fix it.

**Files:**
- Create: `frontend/src/components/world/InitPlayerModal.jsx`
- Create: `frontend/src/__tests__/components/world/InitPlayerModal.test.jsx`
- Modify: `frontend/src/pages/WorldPage.jsx`
- Modify: `frontend/src/__tests__/pages/WorldPage.test.jsx`

---

- [ ] **Step 1: Write the failing test for the modal component**

```jsx
// frontend/src/__tests__/components/world/InitPlayerModal.test.jsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InitPlayerModal from '../../../components/world/InitPlayerModal.jsx';
import * as playerApiModule from '../../../api/player.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('renders name input and submit button', () => {
  render(<InitPlayerModal worldId="w1" onCreated={vi.fn()} />);
  expect(screen.getByLabelText(/角色名/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /开始冒险/ })).toBeInTheDocument();
});

it('calls playerApi.create and onCreated on submit', async () => {
  const mockPlayer = { id: 'p1', name: 'Hero', status: {}, inventory: [] };
  vi.spyOn(playerApiModule.playerApi, 'create').mockResolvedValue(mockPlayer);
  const onCreated = vi.fn();
  render(<InitPlayerModal worldId="w1" onCreated={onCreated} />);
  await userEvent.type(screen.getByLabelText(/角色名/i), 'Hero');
  await userEvent.click(screen.getByRole('button', { name: /开始冒险/ }));
  expect(playerApiModule.playerApi.create).toHaveBeenCalledWith('w1', expect.objectContaining({ name: 'Hero' }));
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(mockPlayer));
});

it('disables button while submitting', async () => {
  let resolve;
  vi.spyOn(playerApiModule.playerApi, 'create').mockReturnValue(new Promise(r => { resolve = r; }));
  render(<InitPlayerModal worldId="w1" onCreated={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/角色名/i), 'Hero');
  await userEvent.click(screen.getByRole('button', { name: /开始冒险/ }));
  expect(screen.getByRole('button', { name: /开始冒险/ })).toBeDisabled();
  resolve({ id: 'p1', name: 'Hero', status: {}, inventory: [] });
});

it('shows error message when create fails', async () => {
  vi.spyOn(playerApiModule.playerApi, 'create').mockRejectedValue(new Error('fail'));
  render(<InitPlayerModal worldId="w1" onCreated={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/角色名/i), 'Hero');
  await userEvent.click(screen.getByRole('button', { name: /开始冒险/ }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd frontend && npm test -- --run src/__tests__/components/world/InitPlayerModal.test.jsx
```
Expected: FAIL — module not found

- [ ] **Step 3: Check playerApi.create signature**

The existing `playerApi` in `frontend/src/api/player.js` — verify it has a `create` method. If not, add:
```js
create: (worldId, player) =>
  apiFetch(`/api/world-sim/player/${worldId}`, { method: 'POST', body: JSON.stringify(player) }),
```

- [ ] **Step 4: Implement InitPlayerModal**

```jsx
// frontend/src/components/world/InitPlayerModal.jsx
import { useState } from 'react';
import { playerApi } from '../../api/player.js';

export default function InitPlayerModal({ worldId, onCreated }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const player = await playerApi.create(worldId, {
        id: `player-${worldId}`,
        world_id: worldId,
        name: name.trim(),
        status: { health: 100, mental: 100, reputation: 0, current_location: null },
        inventory: [],
      });
      onCreated(player);
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-80 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">创建你的角色</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>角色名</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="输入角色名"
              autoFocus
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">创建失败，请重试</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            开始冒险
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add WorldPage test for null player**

In `frontend/src/__tests__/pages/WorldPage.test.jsx`, add:

```jsx
it('shows player init modal when player is null', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(null);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes><Route path="/world/:worldId" element={<WorldPage />} /></Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText(/创建你的角色/)).toBeInTheDocument());
});
```

- [ ] **Step 6: Wire modal into WorldPage**

In `frontend/src/pages/WorldPage.jsx`:

```jsx
import InitPlayerModal from '../components/world/InitPlayerModal.jsx';

// Inside return, before the main layout:
{!loading && !player && (
  <InitPlayerModal worldId={worldId} onCreated={(p) => setPlayer(p)} />
)}
```

Add this just before the final `</div>` of the return, or wrap the full page — the modal is `fixed inset-0` so position in DOM doesn't matter.

- [ ] **Step 7: Run tests**

```
cd frontend && npm test -- --run src/__tests__/components/world/InitPlayerModal.test.jsx src/__tests__/pages/WorldPage.test.jsx
```
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/world/InitPlayerModal.jsx frontend/src/__tests__/components/world/InitPlayerModal.test.jsx frontend/src/api/player.js frontend/src/pages/WorldPage.jsx frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "feat(world): show player init modal when no player profile exists"
```

---

## Task 5: Scene Initialization Modal (P0)

**Purpose:** When a world has zero scenes, MapPanel is empty and the player has nowhere to go. Show a modal to create the first scene by name + description.

**Files:**
- Create: `frontend/src/components/world/InitScenesModal.jsx`
- Create: `frontend/src/__tests__/components/world/InitScenesModal.test.jsx`
- Modify: `frontend/src/pages/WorldPage.jsx`
- Modify: `frontend/src/__tests__/pages/WorldPage.test.jsx`

---

- [ ] **Step 1: Write the failing test**

```jsx
// frontend/src/__tests__/components/world/InitScenesModal.test.jsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InitScenesModal from '../../../components/world/InitScenesModal.jsx';
import * as scenesApiModule from '../../../api/scenes.js';

beforeEach(() => { vi.restoreAllMocks(); });

it('renders scene name input and submit button', () => {
  render(<InitScenesModal worldId="w1" onCreated={vi.fn()} />);
  expect(screen.getByLabelText(/场景名/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /创建场景/ })).toBeInTheDocument();
});

it('calls scenesApi.create and onCreated on submit', async () => {
  const mockScene = { id: 's1', name: '起始酒馆', is_locked: false };
  vi.spyOn(scenesApiModule.scenesApi, 'create').mockResolvedValue(mockScene);
  const onCreated = vi.fn();
  render(<InitScenesModal worldId="w1" onCreated={onCreated} />);
  await userEvent.type(screen.getByLabelText(/场景名/i), '起始酒馆');
  await userEvent.click(screen.getByRole('button', { name: /创建场景/ }));
  expect(scenesApiModule.scenesApi.create).toHaveBeenCalledWith('w1', expect.objectContaining({ name: '起始酒馆' }));
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(mockScene));
});

it('shows error on create failure', async () => {
  vi.spyOn(scenesApiModule.scenesApi, 'create').mockRejectedValue(new Error('fail'));
  render(<InitScenesModal worldId="w1" onCreated={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/场景名/i), '酒馆');
  await userEvent.click(screen.getByRole('button', { name: /创建场景/ }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd frontend && npm test -- --run src/__tests__/components/world/InitScenesModal.test.jsx
```
Expected: FAIL — module not found

- [ ] **Step 3: Check scenesApi.create**

Verify `frontend/src/api/scenes.js` has a `create(worldId, scene)` method. If not, add:
```js
create: (worldId, scene) =>
  apiFetch(`/api/world-sim/scenes/${worldId}`, { method: 'POST', body: JSON.stringify(scene) }),
```

- [ ] **Step 4: Implement InitScenesModal**

```jsx
// frontend/src/components/world/InitScenesModal.jsx
import { useState } from 'react';
import { scenesApi } from '../../api/scenes.js';

export default function InitScenesModal({ worldId, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const scene = await scenesApi.create(worldId, {
        id: crypto.randomUUID(),
        name: name.trim(),
        description: description.trim(),
        is_locked: false,
        characters_present: [],
      });
      onCreated(scene);
    } catch {
      setError(true);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96 shadow-xl">
        <h2 className="text-lg font-semibold mb-1">创建起始场景</h2>
        <p className="text-sm text-gray-500 mb-4">这个世界还没有任何场景，先创建一个起点吧。</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span>场景名</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border rounded px-3 py-2"
              placeholder="例：起始酒馆"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>描述（可选）</span>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="border rounded px-3 py-2 resize-none"
              placeholder="场景简短描述…"
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-600">创建失败，请重试</p>}
          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          >
            创建场景
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Load scenes in WorldPage and show modal when empty**

WorldPage currently doesn't load scenes. Add:

```jsx
import { scenesApi } from '../api/scenes.js';
import InitScenesModal from '../components/world/InitScenesModal.jsx';

// State:
const [scenes, setScenes] = useState(null); // null = not loaded yet

// In useEffect Promise.all, add scenesApi.list:
Promise.all([
  worldsApi.get(worldId),
  playerApi.get(worldId).catch(() => null),
  eventsApi.list(worldId).catch(() => ({ events: [] })),
  scenesApi.list(worldId).catch(() => ({ scenes: [] })),
]).then(([w, p, , s]) => {
  setWorld(w);
  setPlayer(p);
  setScenes(s.scenes || []);
}).finally(() => setLoading(false));

// In return, alongside the player modal:
{!loading && scenes !== null && scenes.length === 0 && (
  <InitScenesModal
    worldId={worldId}
    onCreated={(scene) => setScenes([scene])}
  />
)}
```

- [ ] **Step 6: Add WorldPage test for empty scenes**

```jsx
it('shows scene init modal when world has no scenes', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(eventsApiModule.eventsApi, 'list').mockResolvedValue({ events: [] });
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({ scenes: [] });
  render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes><Route path="/world/:worldId" element={<WorldPage />} /></Routes>
    </MemoryRouter>
  );
  await waitFor(() => expect(screen.getByText(/创建起始场景/)).toBeInTheDocument());
});
```

**Note:** Existing WorldPage test's `renderPage()` helper does NOT mock `scenesApi.list`. Add this mock to the `renderPage()` helper (return `{ scenes: [{ id: 's1', name: 'Town' }] }`) so existing tests don't show the scenes modal:

```jsx
// Add to renderPage() in WorldPage.test.jsx:
import * as scenesApiModule from '../../api/scenes.js';

// Inside renderPage():
vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({ scenes: [{ id: 's1', name: 'Town', is_locked: false }] });
```

- [ ] **Step 7: Run tests**

```
cd frontend && npm test -- --run src/__tests__/components/world/InitScenesModal.test.jsx src/__tests__/pages/WorldPage.test.jsx
```
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/world/InitScenesModal.jsx frontend/src/__tests__/components/world/InitScenesModal.test.jsx frontend/src/pages/WorldPage.jsx frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "feat(world): show scene init modal when world has no scenes"
```

---

## Task 6: Multi-Character Selector + Full Context Building (P1)

**Purpose:** Let users choose which characters participate in the current scene. Also passes `characters` and `activeCharacters` to `buildContext`, which the backend already supports but the frontend ignores.

**Files:**
- Create: `frontend/src/components/world/CharacterSelector.jsx`
- Create: `frontend/src/__tests__/components/world/CharacterSelector.test.jsx`
- Modify: `frontend/src/api/characters.js` — add `listByWorld(worldId)`
- Modify: `frontend/src/pages/WorldPage.jsx` — load characters, show selector in sidebar
- Modify: `frontend/src/__tests__/pages/WorldPage.test.jsx`

---

- [ ] **Step 1: Check characters API**

Read `frontend/src/api/characters.js`. It likely has `list()` (all chars) — add `listByWorld(worldId)`:
```js
listByWorld: (worldId) => apiFetch(`/api/world-sim/characters?worldId=${worldId}`),
```
The backend `/characters?worldId=x` already filters by worldId.

- [ ] **Step 2: Write the failing test for CharacterSelector**

```jsx
// frontend/src/__tests__/components/world/CharacterSelector.test.jsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSelector from '../../../components/world/CharacterSelector.jsx';

const chars = [
  { id: 'c1', name: '艾拉', identity: { description: 'A mage' } },
  { id: 'c2', name: '雷克斯', identity: { description: 'A warrior' } },
];

it('renders a checkbox for each character', () => {
  render(<CharacterSelector characters={chars} active={['c1']} onChange={vi.fn()} />);
  expect(screen.getByLabelText('艾拉')).toBeChecked();
  expect(screen.getByLabelText('雷克斯')).not.toBeChecked();
});

it('calls onChange with updated list when toggling', async () => {
  const onChange = vi.fn();
  render(<CharacterSelector characters={chars} active={['c1']} onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('雷克斯'));
  expect(onChange).toHaveBeenCalledWith(['c1', 'c2']);
});

it('removes character when unchecking', async () => {
  const onChange = vi.fn();
  render(<CharacterSelector characters={chars} active={['c1', 'c2']} onChange={onChange} />);
  await userEvent.click(screen.getByLabelText('艾拉'));
  expect(onChange).toHaveBeenCalledWith(['c2']);
});
```

- [ ] **Step 3: Run to confirm failure**

```
cd frontend && npm test -- --run src/__tests__/components/world/CharacterSelector.test.jsx
```
Expected: FAIL

- [ ] **Step 4: Implement CharacterSelector**

```jsx
// frontend/src/components/world/CharacterSelector.jsx
export default function CharacterSelector({ characters, active, onChange }) {
  function toggle(id) {
    if (active.includes(id)) {
      onChange(active.filter(a => a !== id));
    } else {
      onChange([...active, id]);
    }
  }

  if (characters.length === 0) return null;

  return (
    <div className="px-2">
      <p className="text-xs text-gray-500 uppercase px-0 mb-1">角色</p>
      <ul className="flex flex-col gap-1">
        {characters.map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`char-${c.id}`}
              checked={active.includes(c.id)}
              onChange={() => toggle(c.id)}
              className="rounded"
            />
            <label htmlFor={`char-${c.id}`} className="text-sm truncate cursor-pointer">
              {c.name}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Wire into WorldPage**

In `frontend/src/pages/WorldPage.jsx`:

```jsx
import CharacterSelector from '../components/world/CharacterSelector.jsx';
import { charactersApi } from '../api/characters.js';

// State:
const [characters, setCharacters] = useState([]);
const [activeCharacters, setActiveCharacters] = useState([]);

// Add to Promise.all:
Promise.all([
  worldsApi.get(worldId),
  playerApi.get(worldId).catch(() => null),
  eventsApi.list(worldId).catch(() => ({ events: [] })),
  scenesApi.list(worldId).catch(() => ({ scenes: [] })),
  charactersApi.listByWorld(worldId).catch(() => []),
]).then(([w, p, , s, chars]) => {
  setWorld(w);
  setPlayer(p);
  setScenes(s.scenes || []);
  setCharacters(chars || []);
  setActiveCharacters((chars || []).map(c => c.id)); // all active by default
}).finally(() => setLoading(false));

// In left sidebar, add CharacterSelector:
<CharacterSelector
  characters={characters}
  active={activeCharacters}
  onChange={setActiveCharacters}
/>

// Pass to ChatPane:
<ChatPane
  worldId={worldId}
  worldData={world}
  playerStatus={player?.status}
  narrativeMode={narrativeMode}
  onTurnComplete={handleTurnComplete}
  tokenBudget={4096}
  characters={characters}
  activeCharacters={activeCharacters}
/>
```

- [ ] **Step 6: Run tests**

```
cd frontend && npm test -- --run src/__tests__/components/world/CharacterSelector.test.jsx src/__tests__/pages/WorldPage.test.jsx
```
Expected: all pass (WorldPage tests need `charactersApi.listByWorld` mock — add `vi.spyOn(charactersApiModule.charactersApi, 'listByWorld').mockResolvedValue([])` to `renderPage()`)

- [ ] **Step 7: Run full suite**

```
cd frontend && npm test -- --run
```
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/world/CharacterSelector.jsx frontend/src/__tests__/components/world/CharacterSelector.test.jsx frontend/src/api/characters.js frontend/src/pages/WorldPage.jsx frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "feat(world): add character selector sidebar, pass characters to context builder"
```

---

## Task 7: Scene Unlock on Event Confirm (P2)

**Purpose:** When the user confirms an event, unlock any scene whose `unlocked_by_event` matches the new event's `id`. Happens server-side as part of POST `/events/:worldId`.

**Files:**
- Modify: `src/endpoints/world-simulation/events.js` — POST /:worldId unlocks matching scenes
- Create: `tests/world-simulation/scene-unlock.test.js`

---

- [ ] **Step 1: Write the failing backend test**

```js
// tests/world-simulation/scene-unlock.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { router } from '../../src/endpoints/world-simulation/events.js';
import { startTestServer } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let url, stop, tmpDir;

let eventsDir, scenesDir;

beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-scene-unlock-'));
    eventsDir = path.join(tmpDir, 'events');
    scenesDir = path.join(tmpDir, 'scenes');
    fs.mkdirSync(eventsDir);
    fs.mkdirSync(scenesDir);
    const dirs = {
        worldEvents: eventsDir,
        scenes: scenesDir,
        summaries: tmpDir,
    };
    ({ url, stop } = await startTestServer(router, dirs));

    // Pre-create a locked scene with unlocked_by_event = 'evt-1'
    // Written to scenesDir so readScenes finds it at dirs.scenes/world1.json
    fs.writeFileSync(
        path.join(scenesDir, 'world1.json'),
        JSON.stringify({ scenes: [
            { id: 'scene-a', name: 'Hidden Cave', is_locked: true, unlocked_by_event: 'evt-1' },
            { id: 'scene-b', name: 'Town Square', is_locked: false },
        ]})
    );
});

afterEach(async () => {
    await stop();
    fs.rmSync(tmpDir, { recursive: true });
});

it('unlocks scene when confirmed event id matches unlocked_by_event', async () => {
    const res = await fetch(`${url}/world1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'evt-1', title: 'Found the cave', description: 'A hidden cave was discovered' }),
    });
    expect(res.status).toBe(201);
    const sceneData = JSON.parse(fs.readFileSync(path.join(scenesDir, 'world1.json'), 'utf8'));
    const cave = sceneData.scenes.find(s => s.id === 'scene-a');
    expect(cave.is_locked).toBe(false);
});

it('does not modify scenes when no scene matches', async () => {
    const res = await fetch(`${url}/world1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'evt-999', title: 'Unrelated event', description: 'Nothing changes' }),
    });
    expect(res.status).toBe(201);
    const sceneData = JSON.parse(fs.readFileSync(path.join(scenesDir, 'world1.json'), 'utf8'));
    const cave = sceneData.scenes.find(s => s.id === 'scene-a');
    expect(cave.is_locked).toBe(true); // unchanged
});
```

**Note:** Events storage uses `directories.worldEvents`; scenes storage uses `directories.scenes`. The test uses separate subdirectories (`eventsDir`, `scenesDir`) under `tmpDir` to avoid filename collisions — both storage modules produce `world1.json` and would overwrite each other in a shared directory.

- [ ] **Step 2: Run to confirm failure**

```
npm run test:ws -- --testPathPattern scene-unlock
```
Expected: FAIL — scene is not unlocked after confirm

- [ ] **Step 3: Modify events.js POST to unlock scenes**

In `src/endpoints/world-simulation/events.js`, add after `appendEvent(...)`:

```js
import { readScenes, writeScenes } from './storage/scenes.js';

// Inside POST /:worldId handler, after appendEvent:
// Unlock scenes that reference this event's id
try {
    const sceneData = await readScenes(req.user.directories, req.params.worldId);
    const affected = sceneData.scenes.filter(s => s.unlocked_by_event === event.id);
    if (affected.length > 0) {
        sceneData.scenes = sceneData.scenes.map(s =>
            s.unlocked_by_event === event.id ? { ...s, is_locked: false } : s
        );
        await writeScenes(req.user.directories, req.params.worldId, sceneData);
    }
} catch { /* non-fatal — scenes file may not exist yet */ }
```

- [ ] **Step 4: Run tests**

```
npm run test:ws -- --testPathPattern scene-unlock
```
Expected: 2 passed

- [ ] **Step 5: Run full backend suite**

```
npm run test:ws
```
Expected: all 52+ pass

- [ ] **Step 6: Commit**

```bash
git add src/endpoints/world-simulation/events.js tests/world-simulation/scene-unlock.test.js
git commit -m "feat(events): unlock scenes when confirmed event id matches unlocked_by_event"
```

---

## Task 8: Token Budget from Settings (P2)

**Purpose:** Remove hardcoded `4096` from ChatPane and WorldPage; read from `settingsStore` instead.

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`
- Modify: `frontend/src/__tests__/pages/WorldPage.test.jsx`

---

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/__tests__/pages/WorldPage.test.jsx`:

```jsx
import { useSettingsStore } from '../../stores/settingsStore.js';

// In beforeEach:
useSettingsStore.setState({ apiUrl: '', apiKey: '', model: '', tokenBudget: 4096 });
localStorage.clear();

it('passes tokenBudget from settings to buildContext', async () => {
  useSettingsStore.setState({ tokenBudget: 8192 });
  const buildCtxSpy = vi.spyOn(chatApiModule, 'buildContext').mockResolvedValue({
    systemPrompt: 'sys', trimmedChatHistory: [], mode: 'ensemble',
  });
  vi.spyOn(chatApiModule, 'streamChat').mockImplementation(async ({ onDone }) => { onDone(); });
  renderPage();
  await waitFor(() => screen.getByText('Iron Fog'));
  await userEvent.type(screen.getByRole('textbox'), 'test');
  await userEvent.click(screen.getByRole('button', { name: /发送/ }));
  await waitFor(() => expect(buildCtxSpy).toHaveBeenCalled());
  expect(buildCtxSpy.mock.calls[0][0].tokenBudget).toBe(8192);
});
```

- [ ] **Step 2: Run to confirm failure**

```
cd frontend && npm test -- --run src/__tests__/pages/WorldPage.test.jsx
```
Expected: new test FAIL (tokenBudget is 4096 regardless of settings)

- [ ] **Step 3: Wire tokenBudget into WorldPage + ChatPane**

In `frontend/src/pages/WorldPage.jsx`:

```jsx
import { useSettingsStore } from '../stores/settingsStore.js';

// Inside WorldPage():
const { tokenBudget, getApiConfig } = useSettingsStore();

// Update ChatPane usage:
<ChatPane
  worldId={worldId}
  worldData={world}
  playerStatus={player?.status}
  narrativeMode={narrativeMode}
  onTurnComplete={handleTurnComplete}
  tokenBudget={tokenBudget}
  characters={characters}
  activeCharacters={activeCharacters}
/>
```

ChatPane already accepts `tokenBudget` prop (added in Task 2) with a default of `4096` — no changes needed in ChatPane itself.

Also update `handleTurnComplete` to use `getApiConfig()` instead of `{}` when calling propose:

```jsx
const result = await eventsApi.propose(worldId, recentMessages, getApiConfig());
```

- [ ] **Step 4: Run tests**

```
cd frontend && npm test -- --run src/__tests__/pages/WorldPage.test.jsx
```
Expected: all pass

- [ ] **Step 5: Run full suite**

```
cd frontend && npm test -- --run
```
Expected: all pass

- [ ] **Step 6: Final backend test run**

```
npm run test:ws
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/WorldPage.jsx frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "feat(settings): read tokenBudget and apiConfig from settingsStore in WorldPage"
```

---

## Final Verification

- [ ] Run full backend suite: `npm run test:ws` — expect 54+ tests pass
- [ ] Run full frontend suite: `cd frontend && npm test -- --run` — expect 70+ tests pass
- [ ] Smoke-check SettingsPage route in browser: navigate to `/settings`, verify form appears and saves
- [ ] Invoke finishing-a-development-branch skill
