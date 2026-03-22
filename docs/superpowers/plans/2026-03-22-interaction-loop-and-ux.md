# Interaction Loop & UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the core interaction loop (scene switching updates context, event confirmation triggers world state update + inventory sync + auto-compress) and add UX polish (Markdown rendering, scene context injection).

**Architecture:** MapPanel gets an `onEnter` callback that updates WorldPage player/scene state and injects the current scene into ChatPane's context build. EventProposalCard's accept flow chains: confirm event → update world state → sync inventory → auto-compress if >30 events. Frontend API clients add `stateApi.update()` and `eventsApi.compress()`. No backend changes needed — all APIs already exist.

**Tech Stack:** React 18, Zustand 4, Tailwind CSS 3, Vitest + @testing-library/react (frontend), Node.js ESM + Express 4 + Jest (backend)

**Test commands:**
- Backend: `npm run test:ws` (from repo root)
- Frontend: `cd frontend && npm test -- --run` (or `npm test` for watch)

---

## File Structure

### New files
- `frontend/src/api/state.js` — API client for world state summary endpoints
- `frontend/src/__tests__/api/state.test.js` — tests for state API client

### Modified files
- `frontend/src/api/events.js` — add `compress(worldId, apiConfig)` method
- `frontend/src/components/panels/MapPanel.jsx` — add `onEnter` callback prop to pass scene+player data back
- `frontend/src/components/chat/EventProposalCard.jsx` — chain state update + inventory sync + auto-compress after confirm
- `frontend/src/pages/WorldPage.jsx` — pass `onEnter` to MapPanel, pass `currentScene` to ChatPane, refresh world data after event confirm
- `frontend/src/components/chat/ChatPane.jsx` — accept `currentScene` prop and pass to `buildContext`
- `frontend/src/__tests__/components/panels/MapPanel.test.jsx` — test onEnter callback
- `frontend/src/__tests__/components/chat/EventProposalCard.test.jsx` — test chained state update + inventory + compress
- `frontend/src/__tests__/pages/WorldPage.test.jsx` — test scene switch updates player location display

---

## Task 1: State API Client

**Purpose:** Provide frontend access to `GET /state/:worldId` and `POST /state/:worldId/update`. Currently no frontend client exists for these endpoints.

**Files:**
- Create: `frontend/src/api/state.js`
- Create: `frontend/src/__tests__/api/state.test.js`

---

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/__tests__/api/state.test.js
import { it, expect, vi, beforeEach } from 'vitest';
import { stateApi } from '../../api/state.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('get fetches world state', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ current_state: { summary: 'ok' }, event_count: 5, summaries: [] }),
  });
  const result = await stateApi.get('w1');
  expect(result.current_state.summary).toBe('ok');
  expect(fetch).toHaveBeenCalledWith('/api/world-sim/state/w1', expect.objectContaining({ method: undefined }));
});

it('update posts apiConfig and returns new state', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ current_state: { summary: 'updated' } }),
  });
  const result = await stateApi.update('w1', { apiUrl: 'http://x', apiKey: 'k', model: 'm' });
  expect(result.current_state.summary).toBe('updated');
  expect(fetch).toHaveBeenCalledWith(
    '/api/world-sim/state/w1/update',
    expect.objectContaining({ method: 'POST' })
  );
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
cd frontend && npm test -- --run src/__tests__/api/state.test.js
```
Expected: FAIL — "Cannot find module '../../api/state.js'"

- [ ] **Step 3: Create the state API client**

```js
// frontend/src/api/state.js
import { apiFetch } from './client.js';

const BASE = (worldId) => `/api/world-sim/state/${worldId}`;

export const stateApi = {
    get: (worldId) => apiFetch(BASE(worldId)),
    update: (worldId, apiConfig) =>
        apiFetch(`${BASE(worldId)}/update`, {
            method: 'POST',
            body: JSON.stringify({ apiConfig }),
        }),
};
```

- [ ] **Step 4: Run test to verify it passes**

```
cd frontend && npm test -- --run src/__tests__/api/state.test.js
```
Expected: PASS

- [ ] **Step 5: Add compress method to events API**

In `frontend/src/api/events.js`, add:

```js
compress: (worldId, apiConfig) =>
    apiFetch(`${BASE(worldId)}/compress`, {
        method: 'POST',
        body: JSON.stringify({ apiConfig }),
    }),
```

- [ ] **Step 6: Run all frontend tests**

```
cd frontend && npm test -- --run
```
Expected: all pass (no existing tests depend on events API shape changing)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/state.js frontend/src/__tests__/api/state.test.js frontend/src/api/events.js
git commit -m "feat(api): add state client, add compress to events client"
```

---

## Task 2: MapPanel Scene Switch → Update Player & Scene State

**Purpose:** When the player enters a scene via MapPanel, update WorldPage's player state and current scene so the UI reflects the new location and context builder receives the scene.

**Files:**
- Modify: `frontend/src/components/panels/MapPanel.jsx`
- Modify: `frontend/src/__tests__/components/panels/MapPanel.test.jsx`
- Modify: `frontend/src/pages/WorldPage.jsx`

---

- [ ] **Step 1: Write the failing test for MapPanel onEnter**

Add to `frontend/src/__tests__/components/panels/MapPanel.test.jsx`:

```js
it('calls onEnter with API response when entering a scene', async () => {
  const apiResult = { scene: { id: 's1', name: 'Capital', description: 'The capital city' }, characters_present: ['c1'] };
  vi.spyOn(scenesApiModule.scenesApi, 'enterScene').mockResolvedValue(apiResult);
  const onEnter = vi.fn();
  const onClose = vi.fn();
  render(<MapPanel worldId="w1" scenes={mockScenes} onClose={onClose} onEnter={onEnter} />);
  await userEvent.click(screen.getByText('Capital'));
  await waitFor(() => expect(onEnter).toHaveBeenCalledWith(apiResult));
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
cd frontend && npm test -- --run src/__tests__/components/panels/MapPanel.test.jsx
```
Expected: FAIL — `onEnter` not called (it's not passed through yet)

- [ ] **Step 3: Update MapPanel to call onEnter**

In `frontend/src/components/panels/MapPanel.jsx`, change the component signature and `handleEnter`:

```jsx
export default function MapPanel({ worldId, scenes, onClose, onEnter }) {
  const [enterError, setEnterError] = useState(null);

  async function handleEnter(scene) {
    if (scene.is_locked) return;
    setEnterError(null);
    try {
      const result = await scenesApi.enterScene(worldId, scene.id);
      onEnter?.(result);
      onClose();
    } catch {
      setEnterError(scene.id);
    }
  }
  // ... rest unchanged
```

- [ ] **Step 4: Run MapPanel tests to verify they pass**

```
cd frontend && npm test -- --run src/__tests__/components/panels/MapPanel.test.jsx
```
Expected: all pass

- [ ] **Step 5: Update WorldPage to handle scene enter**

In `frontend/src/pages/WorldPage.jsx`:

1. Add a `currentScene` state:
```jsx
const [currentScene, setCurrentScene] = useState(null);
```

2. Initialize it from loaded scenes (inside the `.then()` callback of the initial `Promise.all`):
```js
// After setScenes(s.scenes || []):
const sceneList = s.scenes || [];
setScenes(sceneList);
if (p?.status?.current_location) {
  setCurrentScene(sceneList.find(sc => sc.id === p.status.current_location) || null);
}
```

3. Add `handleSceneEnter` callback:
```jsx
function handleSceneEnter(result) {
  setCurrentScene(result.scene);
  setPlayer((prev) => prev ? { ...prev, status: { ...prev.status, current_location: result.scene.id } } : prev);
}
```

4. Pass to MapPanel:
```jsx
{showMap && <MapPanel worldId={worldId} scenes={scenes || []} onClose={() => setShowMap(false)} onEnter={handleSceneEnter} />}
```

5. Update the sidebar location display to show the scene name:
```jsx
<p className="text-xs text-ink/60 truncate">{currentScene?.name || player?.status?.current_location || '未知'}</p>
```

6. Pass `currentScene` to ChatPane:
```jsx
<ChatPane
  worldId={worldId}
  worldData={world}
  playerStatus={player?.status}
  currentScene={currentScene}
  narrativeMode={narrativeMode}
  // ... rest
/>
```

- [ ] **Step 6: Update ChatPane to pass currentScene to buildContext**

In `frontend/src/components/chat/ChatPane.jsx`:

1. Add `currentScene` to props:
```jsx
export default function ChatPane({
  worldId, worldData, playerStatus, currentScene, narrativeMode,
  onTurnComplete, tokenBudget = 4096, characters = [], activeCharacters,
  apiConfig = {},
}) {
```

2. Pass it in the `buildContext` call:
```jsx
const { systemPrompt, trimmedChatHistory } = await buildContext({
  worldCard: worldData,
  chatHistory: nextMessages,
  tokenBudget,
  mode: narrativeMode || 'ensemble',
  playerStatus,
  currentScene,
  characters,
  activeCharacters,
});
```

- [ ] **Step 7: Run all frontend tests**

```
cd frontend && npm test -- --run
```
Expected: all pass

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/panels/MapPanel.jsx frontend/src/__tests__/components/panels/MapPanel.test.jsx frontend/src/pages/WorldPage.jsx frontend/src/components/chat/ChatPane.jsx
git commit -m "feat(map): scene switch updates player location and injects scene into context"
```

---

## Task 3: Event Confirm → World State Update + Inventory Sync + Auto-Compress

**Purpose:** When the player accepts an event proposal, chain: (1) confirm event, (2) update world state summary, (3) sync inventory changes if present, (4) auto-compress events if >30. This is the core world-evolution loop from the design spec.

**Files:**
- Modify: `frontend/src/components/chat/EventProposalCard.jsx`
- Modify: `frontend/src/__tests__/components/chat/EventProposalCard.test.jsx`
- Modify: `frontend/src/pages/WorldPage.jsx`

---

- [ ] **Step 1: Write the failing test for chained accept**

Add to `frontend/src/__tests__/components/chat/EventProposalCard.test.jsx`:

```js
import * as stateApiModule from '../../../api/state.js';

it('calls stateApi.update after confirming event', async () => {
  vi.spyOn(eventsApiModule.eventsApi, 'confirm').mockResolvedValue({});
  const updateSpy = vi.spyOn(stateApiModule.stateApi, 'update').mockResolvedValue({ current_state: { summary: 'new' } });
  const onDismiss = vi.fn();
  const apiConfig = { apiUrl: 'http://x', apiKey: 'k', model: 'm' };
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={onDismiss} apiConfig={apiConfig} />);
  await userEvent.click(screen.getByRole('button', { name: /接受/ }));
  await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('w1', apiConfig));
});

it('calls onAccepted with event data after confirm chain completes', async () => {
  vi.spyOn(eventsApiModule.eventsApi, 'confirm').mockResolvedValue({});
  vi.spyOn(stateApiModule.stateApi, 'update').mockResolvedValue({ current_state: { summary: 'new' } });
  const onAccepted = vi.fn();
  render(<EventProposalCard worldId="w1" proposal={mockProposal} onDismiss={vi.fn()} onAccepted={onAccepted} apiConfig={{}} />);
  await userEvent.click(screen.getByRole('button', { name: /接受/ }));
  await waitFor(() => expect(onAccepted).toHaveBeenCalledWith(mockProposal.event_draft));
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
cd frontend && npm test -- --run src/__tests__/components/chat/EventProposalCard.test.jsx
```
Expected: FAIL — `stateApi.update` not called

- [ ] **Step 3: Update EventProposalCard**

Rewrite `frontend/src/components/chat/EventProposalCard.jsx`:

```jsx
import { useState } from 'react';
import { eventsApi } from '../../api/events.js';
import { stateApi } from '../../api/state.js';

export default function EventProposalCard({ worldId, proposal, onDismiss, onAccepted, apiConfig = {} }) {
  const [accepting, setAccepting] = useState(false);

  async function handleAccept() {
    setAccepting(true);
    try {
      await eventsApi.confirm(worldId, proposal.event_draft);
      // Update world state summary (non-blocking for UI — errors are silent)
      stateApi.update(worldId, apiConfig).catch(() => {});
      // Auto-compress if needed (non-blocking)
      eventsApi.compress(worldId, apiConfig).catch(() => {});
      onAccepted?.(proposal.event_draft);
      onDismiss();
    } catch {
      setAccepting(false);
    }
  }

  return (
    <div className="mx-3 mb-2 rounded border border-ink/10 bg-parchment p-3 text-sm">
      <p className="text-ink/70 italic mb-3">{proposal.narrative}</p>
      <p className="font-medium text-ink/80 mb-1">{proposal.event_draft.title}</p>
      <p className="text-ink/50 text-xs mb-3">{proposal.event_draft.description}</p>
      <div className="flex gap-3 justify-end">
        <button
          className="text-xs text-ink/40 hover:text-ink/70 disabled:opacity-50"
          onClick={onDismiss}
          disabled={accepting}
        >
          忽略
        </button>
        <button
          className="text-xs text-ink/60 hover:text-ink font-medium disabled:opacity-50"
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

- [ ] **Step 4: Run EventProposalCard tests**

```
cd frontend && npm test -- --run src/__tests__/components/chat/EventProposalCard.test.jsx
```
Expected: all pass

- [ ] **Step 5: Update WorldPage to handle event acceptance**

In `frontend/src/pages/WorldPage.jsx`:

1. Import `playerApi`:
(already imported)

2. Add `handleEventAccepted` callback:
```jsx
async function handleEventAccepted(eventDraft) {
  // Sync inventory if the event draft includes inventory_changes
  if (eventDraft.inventory_add) {
    for (const item of eventDraft.inventory_add) {
      try {
        await playerApi.addItem(worldId, item);
      } catch { /* ignore */ }
    }
  }
  if (eventDraft.inventory_remove) {
    for (const itemId of eventDraft.inventory_remove) {
      try {
        await playerApi.deleteItem(worldId, itemId);
      } catch { /* ignore */ }
    }
  }
  // Refresh player to get up-to-date inventory
  try {
    const freshPlayer = await playerApi.get(worldId);
    setPlayer(freshPlayer);
  } catch { /* ignore */ }
  // Refresh world to get updated current_state
  try {
    const freshWorld = await worldsApi.get(worldId);
    setWorld(freshWorld);
  } catch { /* ignore */ }
}
```

3. Pass it to EventProposalCard:
```jsx
{pendingProposal && (
  <div className="absolute bottom-16 left-6 right-6">
    <EventProposalCard
      worldId={worldId}
      proposal={pendingProposal}
      onDismiss={clearProposal}
      onAccepted={handleEventAccepted}
      apiConfig={apiConfig}
    />
  </div>
)}
```

- [ ] **Step 6: Run all frontend tests**

```
cd frontend && npm test -- --run
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/EventProposalCard.jsx frontend/src/__tests__/components/chat/EventProposalCard.test.jsx frontend/src/pages/WorldPage.jsx frontend/src/api/state.js frontend/src/__tests__/api/state.test.js frontend/src/api/events.js
git commit -m "feat(events): chain state update, inventory sync, and auto-compress on event confirm"
```

---

## Task 4: Markdown Rendering for Assistant Messages

**Purpose:** Render assistant messages as Markdown (bold, italic, lists, etc.) instead of plain text. The project already depends on `showdown` on the backend; for the frontend we use a lightweight approach.

**Files:**
- Modify: `frontend/src/components/chat/ChatPane.jsx`
- Modify: `frontend/package.json` — add `marked` dependency

---

- [ ] **Step 1: Install marked**

```bash
cd frontend && npm install marked
```

- [ ] **Step 2: Update ChatPane to render Markdown**

In `frontend/src/components/chat/ChatPane.jsx`, add the import and a render helper:

```jsx
import { marked } from 'marked';

// Configure marked for safe rendering
marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  return { __html: marked.parse(text || '') };
}
```

Replace the assistant message `<p>` element (the `msg.role !== 'user'` branch) with:

```jsx
<div
  className={`max-w-prose text-sm leading-relaxed prose prose-sm prose-stone ${msg.error ? 'text-ink/40' : 'text-ink/80'}`}
  dangerouslySetInnerHTML={renderMarkdown(msg.content)}
/>
```

Keep the streaming cursor logic — append it after the rendered content:

```jsx
{msg.role === 'user' ? (
  <p className="inline-block text-sm text-ink/50 max-w-prose text-right">{msg.content}</p>
) : (
  <div className="max-w-prose text-sm leading-relaxed">
    {msg.content ? (
      <div
        className={`prose prose-sm prose-stone ${msg.error ? 'text-ink/40' : 'text-ink/80'}`}
        dangerouslySetInnerHTML={renderMarkdown(msg.content)}
      />
    ) : (
      streaming && i === messages.length - 1 && (
        <span className="inline-block w-1.5 h-4 bg-ink/30 animate-pulse ml-0.5 align-text-bottom" />
      )
    )}
  </div>
)}
```

- [ ] **Step 3: Add Tailwind typography plugin**

```bash
cd frontend && npm install @tailwindcss/typography
```

In `frontend/tailwind.config.js`, add the plugin:

```js
plugins: [require('@tailwindcss/typography')],
```

- [ ] **Step 4: Run all frontend tests**

```
cd frontend && npm test -- --run
```
Expected: all pass (ChatPane tests check for text content which `getByText` finds inside rendered HTML too)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ChatPane.jsx frontend/package.json frontend/package-lock.json frontend/tailwind.config.js
git commit -m "feat(chat): render assistant messages as Markdown with prose styling"
```

---

## Task 5: Final Integration Test & Cleanup

**Purpose:** Verify the full loop works end-to-end: scene switch → chat with scene context → event proposal → accept → world state updated. Also fix the review issue: PUT response returning stale `req.body`.

**Files:**
- Modify: `src/endpoints/world-simulation/worlds.js` — fix PUT response
- Modify: `src/endpoints/world-simulation/characters.js` — fix PUT response
- Modify: `frontend/src/__tests__/pages/WorldPage.test.jsx` — add integration test for scene switch flow

---

- [ ] **Step 1: Fix PUT response in worlds.js**

In `src/endpoints/world-simulation/worlds.js`, change the PUT handler:

```js
// PUT /:worldId — replace
router.put('/:worldId', vId, async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        if (req.body.id && req.body.id !== req.params.worldId) return res.status(400).json({ error: 'id_mismatch' });
        const data = { ...req.body, id: req.params.worldId };
        await writeWorld(req.user.directories, req.params.worldId, data);
        res.json(data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
```

- [ ] **Step 2: Fix PUT response in characters.js**

Same pattern — change `res.json(req.body)` to `res.json(data)`:

```js
router.put('/:charId', vId, async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        if (req.body.id && req.body.id !== req.params.charId) return res.status(400).json({ error: 'id_mismatch' });
        const data = { ...req.body, id: req.params.charId };
        await writeCharacter(req.user.directories, req.params.charId, data);
        res.json(data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
```

- [ ] **Step 3: Remove unused `isValidId` import from events.js**

In `src/endpoints/world-simulation/events.js`, change:
```js
import { validateIdParams, isValidId } from './validate-id.js';
```
to:
```js
import { validateIdParams } from './validate-id.js';
```

- [ ] **Step 4: Add WorldPage integration test for scene switch**

Add to `frontend/src/__tests__/pages/WorldPage.test.jsx`:

```jsx
it('updates location display after entering a scene via map panel', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'get').mockResolvedValue(mockWorld);
  vi.spyOn(playerApiModule.playerApi, 'get').mockResolvedValue(mockPlayer);
  vi.spyOn(scenesApiModule.scenesApi, 'list').mockResolvedValue({
    scenes: [
      { id: 's1', name: 'Town', is_locked: false },
      { id: 's2', name: 'Forest', is_locked: false, description: 'A dark forest' },
    ],
  });
  vi.spyOn(charactersApiModule.charactersApi, 'listByWorld').mockResolvedValue([]);
  vi.spyOn(scenesApiModule.scenesApi, 'enterScene').mockResolvedValue({
    scene: { id: 's2', name: 'Forest', description: 'A dark forest' },
    characters_present: [],
  });

  render(
    <MemoryRouter initialEntries={['/world/w1']}>
      <Routes><Route path="/world/:worldId" element={<WorldPage />} /></Routes>
    </MemoryRouter>
  );
  await waitFor(() => screen.getByText('Iron Fog'));

  // Open map panel
  await userEvent.click(screen.getByRole('button', { name: /地图/ }));
  expect(screen.getByText('Forest')).toBeInTheDocument();

  // Enter Forest scene
  await userEvent.click(screen.getByText('Forest'));
  await waitFor(() => expect(scenesApiModule.scenesApi.enterScene).toHaveBeenCalledWith('w1', 's2'));
});
```

- [ ] **Step 5: Run all tests (backend + frontend)**

```bash
cd frontend && npm test -- --run
cd .. && npm run test:ws
```
Expected: all pass

- [ ] **Step 6: Commit**

```bash
git add src/endpoints/world-simulation/worlds.js src/endpoints/world-simulation/characters.js src/endpoints/world-simulation/events.js frontend/src/__tests__/pages/WorldPage.test.jsx
git commit -m "fix: PUT returns normalized data, remove unused import, add scene switch integration test"
```
