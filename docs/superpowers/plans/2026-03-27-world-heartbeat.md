# World Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the player opens a world on a new day (clock.day > last_tick_day), automatically ask the LLM to generate one NPC-driven event proposal and surface it to the player as a pending event card.

**Architecture:** A new `POST /state/:worldId/tick` route in `state.js` reads world state, recent events, and characters; calls the LLM; updates `world.last_tick_day`; and returns `{ proposal }`. The frontend fires tick after the initial world load, guards against double-triggering with the existing `pendingProposal` check, and routes the result into the existing `EventProposalCard` flow.

**Dependency:** Implement the Time System plan first so `world.clock` exists.

**Tech Stack:** Express (backend), React + Zustand (frontend), Jest (tests)

---

## File Map

| File | Change |
|------|--------|
| `src/endpoints/world-simulation/state.js` | Add imports + `PERIOD_LABELS_TICK` + `TICK_SYSTEM` + `POST /:worldId/tick` route |
| `frontend/src/api/state.js` | Add `tick` method |
| `frontend/src/pages/WorldPage.jsx` | Import `stateApi`, fire tick after initial load |
| `tests/world-simulation/state.test.js` | Add `characters` dir to test setup, add 3 tick tests |

---

### Task 1: Backend — `POST /state/:worldId/tick`

**Files:**
- Modify: `tests/world-simulation/state.test.js`
- Modify: `src/endpoints/world-simulation/state.js`

- [ ] **Step 1: Add `characters` directory to test setup**

In `tests/world-simulation/state.test.js`, find the `beforeAll` block:

```js
beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-state-'));
    ['world-events', 'world-summaries', 'worlds'].forEach(d =>
        fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = {
        worldEvents: path.join(tmpDir, 'world-events'),
        worldSummaries: path.join(tmpDir, 'world-summaries'),
        worlds: path.join(tmpDir, 'worlds'),
    };
```

Replace with:

```js
beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-state-'));
    ['world-events', 'world-summaries', 'worlds', 'characters'].forEach(d =>
        fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = {
        worldEvents: path.join(tmpDir, 'world-events'),
        worldSummaries: path.join(tmpDir, 'world-summaries'),
        worlds: path.join(tmpDir, 'worlds'),
        characters: path.join(tmpDir, 'characters'),
    };
```

- [ ] **Step 2: Write failing tick tests**

Append at the end of `tests/world-simulation/state.test.js` (after the last `});`):

```js
describe('POST /state/:worldId/tick', () => {
    beforeEach(() => setLLMAdapter(null));

    test('returns null when clock.day <= last_tick_day', async () => {
        const worldData = { id: 'tk1', name: 'Tick World', clock: { day: 2, period: 'morning' }, last_tick_day: 2 };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_tk1.json'), JSON.stringify(worldData));

        const res = await fetch(`${server.url}/tk1/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).toBeNull();
    });

    test('returns proposal when LLM generates a significant event', async () => {
        const worldData = { id: 'tk2', name: 'Tick World', clock: { day: 3, period: 'morning' }, last_tick_day: 2 };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_tk2.json'), JSON.stringify(worldData));

        setLLMAdapter(async () => JSON.stringify({
            significant: true,
            title: 'Market Collapse',
            description: 'The grain market collapsed overnight.',
            impact_scope: 'moderate',
            affected_characters: [],
            narrative: '不知何时起，市场上的粮食价格急剧攀升……',
        }));

        const res = await fetch(`${server.url}/tk2/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).not.toBeNull();
        expect(json.proposal.event_draft.title).toBe('Market Collapse');
        expect(json.proposal.event_draft.source).toBe('heartbeat');
        expect(json.proposal.narrative).toContain('不知何时');
    });

    test('returns null when LLM returns significant:false', async () => {
        const worldData = { id: 'tk3', name: 'Tick World', clock: { day: 4, period: 'morning' }, last_tick_day: 3 };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_tk3.json'), JSON.stringify(worldData));

        setLLMAdapter(async () => JSON.stringify({ significant: false }));

        const res = await fetch(`${server.url}/tk3/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).toBeNull();
    });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
npm run test:ws -- --testPathPattern="state.test" 2>&1 | tail -20
```

Expected: 3 new tests fail (route not found).

- [ ] **Step 4: Add imports to `state.js`**

In `src/endpoints/world-simulation/state.js`, change the import block from:

```js
import express from 'express';
import { readWorld, writeWorld } from './storage/worlds.js';
import { readEvents } from './storage/events.js';
import { readSummaries } from './storage/summaries.js';
import { callLLM } from './llm-client.js';
import { validateIdParams } from './validate-id.js';
```

To:

```js
import express from 'express';
import { randomUUID } from 'node:crypto';
import { readWorld, writeWorld } from './storage/worlds.js';
import { readEvents } from './storage/events.js';
import { readSummaries } from './storage/summaries.js';
import { listCharacters } from './storage/characters.js';
import { callLLM } from './llm-client.js';
import { parseLLMJson } from './llm-helpers.js';
import { validateIdParams } from './validate-id.js';
```

- [ ] **Step 5: Add tick route to `state.js`**

Append at the end of `src/endpoints/world-simulation/state.js` (after the existing `POST /:worldId/update` route):

```js
const PERIOD_LABELS_TICK = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };

const TICK_SYSTEM = `你是世界叙事者。根据世界状态和角色动态，判断是否应该生成一个由NPC自发引起的世界事件。
如果是，返回JSON：
{"significant":true,"title":"...","description":"...","impact_scope":"minor|moderate","affected_characters":[],"narrative":"叙事化提示，以「不知何时起」或「听闻」开头"}
如果世界状态暂时不适合产生新事件，返回：{"significant":false}
只返回JSON，不要解释。`;

// POST /:worldId/tick — world heartbeat: generate NPC-driven event if new day
router.post('/:worldId/tick', vId, async (req, res) => {
    try {
        const { apiConfig = {} } = req.body || {};
        const dirs = req.user.directories;
        const worldId = req.params.worldId;

        const world = await readWorld(dirs, worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });

        const clock = world.clock || { day: 1, period: 'morning' };
        const lastTickDay = world.last_tick_day ?? 0;
        if (clock.day <= lastTickDay) return res.json({ proposal: null });

        // Update last_tick_day before LLM call to prevent double-tick on concurrent requests
        await writeWorld(dirs, worldId, { ...world, last_tick_day: clock.day });

        const [eventData, characters] = await Promise.all([
            readEvents(dirs, worldId).catch(() => ({ events: [] })),
            listCharacters(dirs, worldId).catch(() => []),
        ]);

        const recentEventSummary = eventData.events.slice(-5)
            .map(e => `${e.title}（${e.impact_scope}）`).join('；');
        const npcList = characters.slice(0, 8)
            .map(c => `${c.name}：${c.current_state?.status || '（状态未知）'}`)
            .join('、');

        const userMessage = [
            `世界：${world.name}`,
            `当前时间：第${clock.day}天·${PERIOD_LABELS_TICK[clock.period] || clock.period}`,
            `世界状态：${world.current_state?.summary || '（暂无）'}`,
            npcList ? `主要角色状态：${npcList}` : '',
            recentEventSummary ? `近期事件：${recentEventSummary}` : '',
        ].filter(Boolean).join('\n');

        let raw;
        try {
            raw = await callLLM([{ role: 'user', content: userMessage }], TICK_SYSTEM, apiConfig);
        } catch {
            return res.json({ proposal: null });
        }

        let parsed;
        try { parsed = parseLLMJson(raw); } catch { return res.json({ proposal: null }); }

        if (!parsed.significant || !parsed.title) return res.json({ proposal: null });

        const eventDraft = {
            id: randomUUID(),
            world_id: worldId,
            timestamp: new Date().toISOString(),
            title: parsed.title,
            description: parsed.description || '',
            impact_scope: parsed.impact_scope || 'minor',
            affected_characters: parsed.affected_characters || [],
            confirmed_by_user: false,
            source: 'heartbeat',
        };

        res.json({ proposal: { narrative: parsed.narrative || eventDraft.title, event_draft: eventDraft } });
    } catch (err) {
        console.error('[tick] failed:', err.message);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
npm run test:ws -- --testPathPattern="state.test" 2>&1 | tail -15
```

Expected: all state tests pass including the 3 new tick tests.

- [ ] **Step 7: Commit**

```bash
git add src/endpoints/world-simulation/state.js tests/world-simulation/state.test.js
git commit -m "feat: POST /state/:worldId/tick — world heartbeat generates NPC-driven event proposal"
```

---

### Task 2: Frontend — API method and WorldPage trigger

**Files:**
- Modify: `frontend/src/api/state.js`
- Modify: `frontend/src/pages/WorldPage.jsx`

- [ ] **Step 1: Add `tick` to stateApi**

In `frontend/src/api/state.js`, change the export from:

```js
export const stateApi = {
    get: (worldId) => apiFetch(BASE(worldId)),
    update: (worldId, apiConfig) =>
        apiFetch(`${BASE(worldId)}/update`, {
            method: 'POST',
            body: JSON.stringify({ apiConfig }),
        }),
};
```

To:

```js
export const stateApi = {
    get: (worldId) => apiFetch(BASE(worldId)),
    update: (worldId, apiConfig) =>
        apiFetch(`${BASE(worldId)}/update`, {
            method: 'POST',
            body: JSON.stringify({ apiConfig }),
        }),
    tick: (worldId, apiConfig) =>
        apiFetch(`${BASE(worldId)}/tick`, {
            method: 'POST',
            body: JSON.stringify({ apiConfig }),
        }),
};
```

- [ ] **Step 2: Add `stateApi` import to WorldPage**

In `frontend/src/pages/WorldPage.jsx`, find the imports block and add after the existing API imports:

```js
import { stateApi } from '../api/state.js';
```

(Add it after `import { scenesApi } from '../api/scenes.js';`)

- [ ] **Step 3: Fire heartbeat tick after initial load**

In `frontend/src/pages/WorldPage.jsx`, find the Promise.all `.then()` callback. It currently ends with:

```js
      if (charList.length > 0) setSelectedCharacterId(charList[0].id);
    }).finally(() => setLoading(false));
```

Replace the `.then()` closing and `.finally()` with:

```js
      if (charList.length > 0) setSelectedCharacterId(charList[0].id);

      // Fire-and-forget: world heartbeat — surface NPC-driven event if new day
      const worldClock = w?.clock || { day: 1, period: 'morning' };
      if (worldClock.day > (w?.last_tick_day ?? 0)) {
        stateApi.tick(worldId, apiConfig)
          .then(({ proposal }) => {
            if (proposal && mountedRef.current && !useEventStore.getState().pendingProposal) {
              useEventStore.getState().setPendingProposal(proposal);
            }
          })
          .catch(() => {});
      }
    }).finally(() => setLoading(false));
```

- [ ] **Step 4: Run frontend build**

```bash
cd frontend && npm run build 2>&1 | tail -15
```

Expected: `✓ built in ...` with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/state.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: fire world heartbeat tick on load, surface NPC-driven event proposal"
```

---

### Task 3: Full test suite verification

- [ ] **Step 1: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected:
```
Test Suites: 14 passed, 14 total
Tests:       78 passed, 78 total
```

(75 after Time System plan + 3 new tick tests)
