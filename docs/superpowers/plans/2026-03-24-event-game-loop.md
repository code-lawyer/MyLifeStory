# Event Game Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect four already-built subsystems — event history, chat context, auto-compression, and map UI — so the game loop becomes fully reactive: accepted world events influence character dialogue, players can review event history in-game, events are auto-compressed before they bloat context, and locked scenes show their unlock condition.

**Architecture:** The backend `context.js` already accepts `eventLog` + `archivedSummaries` and injects them into the LLM system prompt with a dedicated token budget. The only missing pieces are: (1) the frontend never loads or passes events to `buildContext`, (2) no in-game event log panel exists, (3) `eventsApi.compress` is never triggered, (4) `MapPanel` doesn't show unlock conditions. All four tasks are pure wiring — no new storage, endpoints, or data shapes required except one small backend change.

**Tech Stack:** React, Zustand, Express, Vitest + @testing-library/react

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/components/panels/EventLogPanel.jsx` | Slide-in panel listing accepted world events |

### Modified Files
| File | Changes |
|------|---------|
| `src/endpoints/world-simulation/events.js:13-20` | Add summaries to GET response |
| `frontend/src/pages/WorldPage.jsx` | Load events/summaries state; pass to ChatPane; update on accept; trigger compress |
| `frontend/src/components/chat/ChatPane.jsx` | Accept `eventLog`/`archivedSummaries` props; pass to `buildContext` |
| `frontend/src/components/panels/MapPanel.jsx` | Show unlock condition text for locked scenes |

---

## Task 1: Backend — Events GET returns summaries

**Context:** `context.js` expects the frontend to pass `archivedSummaries` in the `buildContext` payload. Today the frontend doesn't load summaries at all. The simplest fix: make `GET /events/:worldId` return both events and summaries in one call.

**Files:**
- Modify: `src/endpoints/world-simulation/events.js:13-20`

- [ ] **Step 1: Update events GET handler to include summaries**

In `src/endpoints/world-simulation/events.js`, the GET handler is currently:

```js
router.get('/:worldId', vId, async (req, res) => {
    try {
        const data = await readEvents(req.user.directories, req.params.worldId);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

Replace it with:

```js
router.get('/:worldId', vId, async (req, res) => {
    try {
        const [eventData, summaryData] = await Promise.all([
            readEvents(req.user.directories, req.params.worldId),
            readSummaries(req.user.directories, req.params.worldId).catch(() => ({ summaries: [] })),
        ]);
        res.json({ ...eventData, summaries: summaryData.summaries || [] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

This is backward-compatible: all existing callers that only read `.events` continue to work.

- [ ] **Step 2: Commit**

```bash
git add src/endpoints/world-simulation/events.js
git commit -m "feat: include summaries in events GET response"
```

---

## Task 2: WorldPage — Load events state and pass to ChatPane

**Context:** `WorldPage` currently loads worlds/player/scenes/characters/relationships on mount but not events. We add `events` and `summaries` state, load them alongside the other data, and pass them down to `ChatPane`.

**Note:** `eventsApi` is **already imported** at line 5 of `WorldPage.jsx` (`import { eventsApi } from '../api/events.js'`). Do not add a duplicate import.

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`

- [ ] **Step 1: Add events and summaries state**

After the existing state declarations (around line 33-38), add:

```js
const [events, setEvents] = useState([]);
const [summaries, setSummaries] = useState([]);
```

- [ ] **Step 2: Load events in the initial useEffect**

The initial `Promise.all` (around line 63-81) currently loads 5 resources. Add events as a 6th:

```js
Promise.all([
  worldsApi.get(worldId),
  playerApi.get(worldId).catch(() => null),
  scenesApi.list(worldId).catch(() => ({ scenes: [] })),
  charactersApi.listByWorld(worldId).catch(() => []),
  relationshipsApi.get(worldId).catch(() => ({ relationships: {} })),
  eventsApi.list(worldId).catch(() => ({ events: [], summaries: [] })),
]).then(([w, p, s, chars, rels, evts]) => {
  setWorld(w);
  setPlayer(p);
  const sceneList = s.scenes || [];
  setScenes(sceneList);
  if (p?.status?.current_location) {
    setCurrentScene(sceneList.find(sc => sc.id === p.status.current_location) || null);
  }
  const charList = Array.isArray(chars) ? chars : [];
  setCharacters(charList);
  setRelationships(rels.relationships || {});
  if (charList.length > 0) setSelectedCharacterId(charList[0].id);
  setEvents(evts.events || []);
  setSummaries(evts.summaries || []);
}).finally(() => setLoading(false));
```

- [ ] **Step 3: Pass events and summaries to ChatPane**

Find the `<ChatPane>` JSX (around line 237-248) and add two props:

```jsx
<ChatPane
  worldId={worldId}
  worldData={world}
  playerStatus={player?.status}
  currentScene={currentScene}
  narrativeMode={narrativeMode}
  onTurnComplete={handleTurnComplete}
  tokenBudget={tokenBudget}
  characters={characters}
  activeCharacterId={selectedCharacterId}
  apiConfig={apiConfig}
  eventLog={events}
  archivedSummaries={summaries}
/>
```

- [ ] **Step 4: Verify build**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in ...`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WorldPage.jsx
git commit -m "feat: load events/summaries in WorldPage, pass to ChatPane"
```

---

## Task 3: ChatPane — Forward events to buildContext

**Context:** `context.js` has a dedicated `events` token budget and already knows how to format `eventLog` and `archivedSummaries` into the system prompt. The only missing piece is the frontend passing them.

**Files:**
- Modify: `frontend/src/components/chat/ChatPane.jsx`

- [ ] **Step 1: Accept new props**

The `ChatPane` function signature (lines 12-16) currently is:

```js
export default function ChatPane({
  worldId, worldData, playerStatus, currentScene, narrativeMode,
  onTurnComplete, tokenBudget = 4096, characters = [], activeCharacterId,
  apiConfig = {},
}) {
```

Replace with (note the closing `}) {` on the last line):

```js
export default function ChatPane({
  worldId, worldData, playerStatus, currentScene, narrativeMode,
  onTurnComplete, tokenBudget = 4096, characters = [], activeCharacterId,
  apiConfig = {}, eventLog = [], archivedSummaries = [],
}) {
```

- [ ] **Step 2: Pass to buildContext**

In `handleSend`, the `buildContext` call (around line 47-58) currently sends:

```js
const { systemPrompt, trimmedChatHistory } = await buildContext({
  worldCard: worldData,
  chatHistory: charMessages,
  tokenBudget,
  mode: narrativeMode || 'ensemble',
  playerStatus,
  currentScene,
  characters,
  activeCharacters: [activeCharacterId],
  worldId,
  activeCharacterId,
});
```

Add the two new fields:

```js
const { systemPrompt, trimmedChatHistory } = await buildContext({
  worldCard: worldData,
  chatHistory: charMessages,
  tokenBudget,
  mode: narrativeMode || 'ensemble',
  playerStatus,
  currentScene,
  characters,
  activeCharacters: [activeCharacterId],
  worldId,
  activeCharacterId,
  eventLog,
  archivedSummaries,
});
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/ChatPane.jsx
git commit -m "feat: pass eventLog and archivedSummaries to buildContext"
```

---

## Task 4: WorldPage — Update events on accept + auto-compress

**Depends on Task 1.** The post-compress reload calls `eventsApi.list(worldId)` and reads `fresh.summaries`. This field only exists after the backend change in Task 1 is deployed. If Task 1 has not been applied first, `fresh.summaries` will be `undefined`, and the `|| []` fallback will silently clear in-memory summaries. Always complete Task 1 before Task 4.

**Context:** When a player accepts a proposed event, `handleEventAccepted` currently updates player inventory and world state but never touches the local `events` array. So the accepted event stays invisible to the context builder until next page load. We fix this, and also trigger compression when non-major events reach 10.

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`

- [ ] **Step 1: Update handleEventAccepted to add event to local state**

The current `handleEventAccepted` (lines 97-113):

```js
async function handleEventAccepted(eventDraft) {
  if (eventDraft.inventory_add) {
    for (const item of eventDraft.inventory_add) {
      try { await playerApi.addItem(worldId, item); } catch { /* ignore */ }
    }
  }
  if (eventDraft.inventory_remove) {
    for (const itemId of eventDraft.inventory_remove) {
      try { await playerApi.deleteItem(worldId, itemId); } catch { /* ignore */ }
    }
  }
  const [freshPlayer, freshWorld] = await Promise.all([
    playerApi.get(worldId).catch(() => null),
    worldsApi.get(worldId).catch(() => null),
  ]);
  if (freshPlayer) setPlayer(freshPlayer);
  if (freshWorld) setWorld(freshWorld);
}
```

Replace with:

```js
async function handleEventAccepted(eventDraft) {
  if (eventDraft.inventory_add) {
    for (const item of eventDraft.inventory_add) {
      try { await playerApi.addItem(worldId, item); } catch { /* ignore */ }
    }
  }
  if (eventDraft.inventory_remove) {
    for (const itemId of eventDraft.inventory_remove) {
      try { await playerApi.deleteItem(worldId, itemId); } catch { /* ignore */ }
    }
  }
  const [freshPlayer, freshWorld] = await Promise.all([
    playerApi.get(worldId).catch(() => null),
    worldsApi.get(worldId).catch(() => null),
  ]);
  if (freshPlayer) setPlayer(freshPlayer);
  if (freshWorld) setWorld(freshWorld);

  const newEvents = [...events, eventDraft];
  setEvents(newEvents);

  // Auto-compress when non-major events accumulate
  const compressible = newEvents.filter(e => e.impact_scope !== 'major');
  if (compressible.length >= 10) {
    try {
      await eventsApi.compress(worldId, apiConfig);
      const fresh = await eventsApi.list(worldId);
      setEvents(fresh.events || []);
      setSummaries(fresh.summaries || []);
    } catch (err) {
      console.warn('[WorldPage] auto-compress failed (non-fatal):', err.message);
    }
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WorldPage.jsx
git commit -m "feat: update events state on accept, auto-compress at 10 non-major events"
```

---

## Task 5: EventLogPanel — In-game event history panel

**Context:** Players have no way to review accepted events while playing (only in the separate archive page). We add a lightweight slide-in panel following the existing `MapPanel`/`PlayerProfilePanel` pattern.

**Files:**
- Create: `frontend/src/components/panels/EventLogPanel.jsx`
- Modify: `frontend/src/pages/WorldPage.jsx`

- [ ] **Step 1: Create EventLogPanel**

Create `frontend/src/components/panels/EventLogPanel.jsx`:

```jsx
import SlidePanel from './SlidePanel.jsx';

const IMPACT_LABELS = { minor: '微', moderate: '中', major: '重' };
const IMPACT_COLORS = {
  minor:    'text-ink/30',
  moderate: 'text-amber-500/60',
  major:    'text-red-400/70',
};

export default function EventLogPanel({ events, onClose }) {
  const sorted = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <SlidePanel title="世界事件" onClose={onClose}>
      {sorted.length === 0 ? (
        <p className="text-xs text-ink/30">尚无重大事件</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((event) => (
            <li key={event.id} className="border-b border-ink/5 pb-3 last:border-0">
              <div className="flex items-start gap-2">
                <span className={`text-[10px] font-medium shrink-0 mt-0.5 ${IMPACT_COLORS[event.impact_scope] || 'text-ink/30'}`}>
                  [{IMPACT_LABELS[event.impact_scope] || '?'}]
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-ink/80 font-medium">{event.title}</p>
                  {event.description && (
                    <p className="text-xs text-ink/50 mt-0.5 leading-relaxed">{event.description}</p>
                  )}
                  <p className="text-[10px] text-ink/25 mt-1">
                    {new Date(event.timestamp).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SlidePanel>
  );
}
```

- [ ] **Step 2: Wire to WorldPage**

In `WorldPage`, add state:

```js
const [showEventLog, setShowEventLog] = useState(false);
```

Add import at top:

```js
import EventLogPanel from '../components/panels/EventLogPanel.jsx';
```

Add button to the sidebar nav buttons (the `div` at ~line 229 with 地图/状态/背包):

```jsx
<div className="flex flex-col gap-0.5 text-xs text-ink/40">
  <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowMap(true)}>地图</button>
  <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowEventLog(true)}>
    事件{events.length > 0 && <span className="ml-1 text-[9px] text-ink/25">{events.length}</span>}
  </button>
  <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowProfile(true)}>状态</button>
  <button className="text-left hover:text-ink/70 transition-colors py-0.5" onClick={() => setShowInventory(true)}>背包</button>
</div>
```

Add panel to the overlay section (after the existing panels):

```jsx
{showEventLog && <EventLogPanel events={events} onClose={() => setShowEventLog(false)} />}
```

- [ ] **Step 3: Verify build**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/panels/EventLogPanel.jsx frontend/src/pages/WorldPage.jsx
git commit -m "feat: EventLogPanel — in-game event history with impact badges"
```

---

## Task 6: MapPanel — Show unlock condition for locked scenes

**Context:** `MapPanel` already dims and disables locked scenes, but the unlock condition is only shown as a browser tooltip (`title` attribute). Players on touch devices never see it. We show it inline as a sub-line of text.

**Files:**
- Modify: `frontend/src/components/panels/MapPanel.jsx`

- [ ] **Step 1: Replace scene button with inline unlock condition**

Replace the entire `return` block in `MapPanel.jsx`:

```jsx
return (
  <SlidePanel title="地图" onClose={onClose}>
    <ul className="space-y-1">
      {scenes.map((scene) => (
        <li key={scene.id}>
          <button
            className={`w-full text-left px-2 py-1.5 text-sm rounded ${
              scene.is_locked
                ? 'text-ink/30 cursor-not-allowed'
                : 'text-ink/70 hover:text-ink hover:bg-ink/5'
            }`}
            onClick={() => handleEnter(scene)}
            disabled={scene.is_locked}
          >
            <span className="flex items-center gap-1.5">
              {scene.is_locked && <span className="text-[11px]">🔒</span>}
              {scene.name}
            </span>
            {scene.is_locked && scene.unlock_condition && (
              <span className="block text-[10px] text-ink/25 mt-0.5 leading-relaxed font-normal">
                {scene.unlock_condition}
              </span>
            )}
            {enterError === scene.id && (
              <span className="block text-xs text-ink/40 mt-0.5">进入失败</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  </SlidePanel>
);
```

- [ ] **Step 2: Verify build**

```bash
cd frontend && npx vite build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/panels/MapPanel.jsx
git commit -m "feat: show inline unlock condition for locked scenes in MapPanel"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Full build**

```bash
cd frontend && npx vite build 2>&1 | tail -10
```

Expected: `✓ built in ...`, no errors.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -20
```

Fix any failures caused by the new ChatPane props (tests that render ChatPane without `eventLog`/`archivedSummaries` still work because both default to `[]`).
