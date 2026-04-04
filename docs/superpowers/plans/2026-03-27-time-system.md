# Time System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a world clock (`day` + `period`) that advances every time the player enters a scene, visible in the UI and injected into LLM context.

**Architecture:** `clock: { day, period }` is stored on the world JSON. `POST /worlds/:worldId/advance-time` increments the period (morning → afternoon → evening → night → next day morning) and persists it. The context builder injects the current time into the system prompt. The frontend calls advance-time fire-and-forget on every scene entry and displays the clock in the sidebar.

**Tech Stack:** Express (backend), React + Zustand (frontend), Jest (tests)

---

## File Map

| File | Change |
|------|--------|
| `src/endpoints/world-simulation/worlds.js` | Add `PERIODS` const + `POST /:worldId/advance-time` route |
| `src/endpoints/world-simulation/context.js` | Add `PERIOD_LABELS` const + clock line in `worldBaseText` array |
| `frontend/src/api/worlds.js` | Add `advanceTime` method |
| `frontend/src/pages/WorldPage.jsx` | Add `PERIOD_LABELS` const, display clock in sidebar, call `advanceTime` in `handleSceneEnter` |
| `tests/world-simulation/worlds.test.js` | Add two advance-time tests |
| `tests/world-simulation/context.test.js` | Add one clock injection test |

---

### Task 1: Backend — `POST /worlds/:worldId/advance-time`

**Files:**
- Modify: `tests/world-simulation/worlds.test.js`
- Modify: `src/endpoints/world-simulation/worlds.js`

- [ ] **Step 1: Write failing tests**

Append at the end of `tests/world-simulation/worlds.test.js` (after the last `test(...)` block):

```js
test('POST /worlds/:worldId/advance-time advances period from morning to afternoon', async () => {
    await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'wt1', name: 'Clock World' }),
    });
    const r = await fetch(`${url}/worlds/wt1/advance-time`, { method: 'POST' });
    expect(r.status).toBe(200);
    const { clock } = await r.json();
    expect(clock).toEqual({ day: 1, period: 'afternoon' });
});

test('POST /worlds/:worldId/advance-time wraps night to next day morning', async () => {
    await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'wt2', name: 'Clock World', clock: { day: 2, period: 'night' } }),
    });
    const r = await fetch(`${url}/worlds/wt2/advance-time`, { method: 'POST' });
    expect(r.status).toBe(200);
    const { clock } = await r.json();
    expect(clock).toEqual({ day: 3, period: 'morning' });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:ws -- --testPathPattern="worlds.test" 2>&1 | tail -20
```

Expected: two tests fail with `404` or `TypeError` (route not found).

- [ ] **Step 3: Implement `advance-time` route**

In `src/endpoints/world-simulation/worlds.js`, append before the final blank line at end of file:

```js
const PERIODS = ['morning', 'afternoon', 'evening', 'night'];

// POST /:worldId/advance-time — advance world clock by one period
router.post('/:worldId/advance-time', vId, async (req, res) => {
    try {
        const dirs = req.user.directories;
        const world = await readWorld(dirs, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });

        const clock = world.clock || { day: 1, period: 'morning' };
        const currentIdx = PERIODS.indexOf(clock.period);
        const nextIdx = currentIdx === -1 ? 1 : (currentIdx + 1) % PERIODS.length;
        const newClock = {
            day: nextIdx === 0 ? clock.day + 1 : clock.day,
            period: PERIODS[nextIdx],
        };
        await writeWorld(dirs, req.params.worldId, { ...world, clock: newClock });
        res.json({ clock: newClock });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:ws -- --testPathPattern="worlds.test" 2>&1 | tail -15
```

Expected: all tests pass including the two new ones.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/worlds.js tests/world-simulation/worlds.test.js
git commit -m "feat: POST /worlds/:worldId/advance-time — progress world clock by one period"
```

---

### Task 2: Backend — Inject clock into context system prompt

**Files:**
- Modify: `tests/world-simulation/context.test.js`
- Modify: `src/endpoints/world-simulation/context.js`

- [ ] **Step 1: Write failing test**

Append at the end of the `describe('POST /context/build', ...)` block in `tests/world-simulation/context.test.js`, before the closing `});`:

```js
    test('includes clock in system prompt when worldCard has clock', async () => {
        const payload = {
            ...BASE_PAYLOAD,
            worldCard: { ...BASE_PAYLOAD.worldCard, clock: { day: 3, period: 'evening' } },
        };
        const res = await fetch(`${server.url}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        expect(res.status).toBe(200);
        const { systemPrompt } = await res.json();
        expect(systemPrompt).toContain('第3天');
        expect(systemPrompt).toContain('傍晚');
    });
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:ws -- --testPathPattern="context.test" 2>&1 | tail -15
```

Expected: new test fails (systemPrompt doesn't contain '第3天').

- [ ] **Step 3: Implement clock injection**

In `src/endpoints/world-simulation/context.js`, add the `PERIOD_LABELS` constant after the closing `};` of the `BUDGETS` object (around line 10):

```js
const PERIOD_LABELS = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };
```

Then in the `worldBaseText` array inside `router.post('/build', ...)`, add the clock line immediately before the `current_state` line. The array currently ends with:

```js
        worldCard.current_state?.summary ? `# 当前世界状态\n${worldCard.current_state.summary}` : '',
```

Change that to:

```js
        worldCard.clock ? `# 当前时间\n第${worldCard.clock.day}天 · ${PERIOD_LABELS[worldCard.clock.period] || worldCard.clock.period}` : '',
        worldCard.current_state?.summary ? `# 当前世界状态\n${worldCard.current_state.summary}` : '',
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:ws -- --testPathPattern="context.test" 2>&1 | tail -15
```

Expected: all 4 context tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/context.js tests/world-simulation/context.test.js
git commit -m "feat: inject world clock into context system prompt"
```

---

### Task 3: Frontend — API method, display, and scene-enter trigger

**Files:**
- Modify: `frontend/src/api/worlds.js`
- Modify: `frontend/src/pages/WorldPage.jsx`

- [ ] **Step 1: Add `advanceTime` to worldsApi**

In `frontend/src/api/worlds.js`, add the following entry to the `worldsApi` object (after the `npcDrift` entry):

```js
  advanceTime: (worldId) =>
    apiFetch(`${BASE}/worlds/${worldId}/advance-time`, { method: 'POST' }),
```

- [ ] **Step 2: Add `PERIOD_LABELS` constant to WorldPage**

In `frontend/src/pages/WorldPage.jsx`, add the following constant after the existing `NARRATIVE_MODE_LABELS` constant (around line 27):

```js
const PERIOD_LABELS = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };
```

- [ ] **Step 3: Display clock in sidebar**

In `frontend/src/pages/WorldPage.jsx`, find the scene display block in the left sidebar:

```jsx
          <div>
            <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">场景</p>
            <p className="text-xs text-ink/60 truncate">{currentScene?.name || player?.status?.current_location || '未知'}</p>
          </div>
```

Replace with:

```jsx
          <div>
            <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">场景</p>
            <p className="text-xs text-ink/60 truncate">{currentScene?.name || player?.status?.current_location || '未知'}</p>
          </div>
          {world?.clock && (
            <div>
              <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">时间</p>
              <p className="text-xs text-ink/60">第{world.clock.day}天 · {PERIOD_LABELS[world.clock.period] || world.clock.period}</p>
            </div>
          )}
```

- [ ] **Step 4: Call `advanceTime` in `handleSceneEnter`**

In `frontend/src/pages/WorldPage.jsx`, find the end of `handleSceneEnter`:

```js
    setPlayer((prev) => prev ? { ...prev, status: { ...prev.status, current_location: scene.id } } : prev);
  }
```

Replace with:

```js
    setPlayer((prev) => prev ? { ...prev, status: { ...prev.status, current_location: scene.id } } : prev);

    // Fire-and-forget: advance world clock on every scene entry
    worldsApi.advanceTime(worldId)
      .then(({ clock }) => { if (mountedRef.current) setWorld(prev => prev ? { ...prev, clock } : prev); })
      .catch(() => {});
  }
```

- [ ] **Step 5: Run frontend build**

```bash
cd frontend && npm run build 2>&1 | tail -15
```

Expected: `✓ built in ...` with no errors. Fix any TypeScript/JSX errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/worlds.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: display world clock in sidebar, advance on scene entry"
```

---

### Task 4: Full test suite verification

- [ ] **Step 1: Run all tests**

```bash
npm test 2>&1 | tail -15
```

Expected:
```
Test Suites: 14 passed, 14 total
Tests:       75 passed, 75 total
```

(72 existing + 3 new tests)
