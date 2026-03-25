# Player Status Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a confirmed event that includes `"__player__"` in `affected_characters`, automatically update the player's health/mental/reputation via LLM-computed deltas.

**Architecture:** New `POST /player/:worldId/drift` endpoint in the existing `player.js` router. Reads player from disk, calls LLM for delta JSON, applies `current + (delta || 0)` with clamp, writes back. Frontend fires-and-forgets from `handleEventAccepted`, guarded by `mountedRef`.

**Tech Stack:** Express (backend), React (frontend), `callLLM` from `./llm-client.js`

---

## File Map

| File | Change |
|------|--------|
| `src/endpoints/world-simulation/player.js` | Add `callLLM` import + new `POST /:worldId/drift` route |
| `frontend/src/api/player.js` | Add `drift` method |
| `frontend/src/pages/WorldPage.jsx` | Add fire-and-forget trigger in `handleEventAccepted` |

---

### Task 1: Backend — `POST /:worldId/drift` route

**Files:**
- Modify: `src/endpoints/world-simulation/player.js`

**Reference:** `src/endpoints/world-simulation/worlds.js` — see `NARRATE_SYSTEM` + narrate route (lines 115–155) for the exact `callLLM` pattern to follow.

- [ ] **Step 1: Add `callLLM` import**

In `src/endpoints/world-simulation/player.js`, change line 1–3 from:
```js
import express from 'express';
import { readPlayer, writePlayer } from './storage/players.js';
import { validateIdParams } from './validate-id.js';
```
to:
```js
import express from 'express';
import { readPlayer, writePlayer } from './storage/players.js';
import { validateIdParams } from './validate-id.js';
import { callLLM } from './llm-client.js';
```

- [ ] **Step 2: Add the drift route**

Append the following after the existing `router.delete('/:worldId/inventory/:itemId', ...)` block (after line 76), before the end of the file:

```js
const PLAYER_DRIFT_SYSTEM = `你是命运裁判。根据事件，用JSON输出玩家三项属性的变化量。格式：{"health":N,"mental":N,"reputation":N}，N为整数。只输出JSON，不要解释。`;

// POST /:worldId/drift — update player status after an event
router.post('/:worldId/drift', vId, async (req, res) => {
    try {
        const { event, apiConfig = {} } = req.body;
        if (!event?.title) return res.status(400).json({ error: 'missing_fields' });

        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });

        const { health = 0, mental = 0, reputation = 0 } = player.status || {};
        const userMessage = [
            `当前状态：生命值${health}，精神值${mental}，声望${reputation}`,
            `事件（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`,
        ].join('\n');

        let delta;
        try {
            const raw = await callLLM([{ role: 'user', content: userMessage }], PLAYER_DRIFT_SYSTEM, apiConfig);
            delta = JSON.parse(raw);
        } catch {
            return res.json({ player });
        }

        const clamp = (v) => Math.max(0, Math.min(100, v));
        player.status = {
            ...(player.status || {}),
            health:     clamp(health     + (delta.health     || 0)),
            mental:     clamp(mental     + (delta.mental     || 0)),
            reputation: clamp(reputation + (delta.reputation || 0)),
        };
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.json({ player });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/player.js
git commit -m "feat: POST /player/:worldId/drift — update player status after event"
```

---

### Task 2: Frontend — API method + WorldPage trigger

**Files:**
- Modify: `frontend/src/api/player.js`
- Modify: `frontend/src/pages/WorldPage.jsx` (lines 138–141, after npc-drift block)

- [ ] **Step 1: Add `drift` method to `frontend/src/api/player.js`**

Current file ends at line 14. Add one entry to the `playerApi` object:

```js
export const playerApi = {
    get: (worldId) => apiFetch(BASE(worldId)),
    create: (worldId, player) => apiFetch(BASE(worldId), { method: 'POST', body: JSON.stringify(player) }),
    update: (worldId, player) => apiFetch(BASE(worldId), { method: 'PUT', body: JSON.stringify(player) }),
    updateStatus: (worldId, status) =>
        apiFetch(`${BASE(worldId)}/status`, { method: 'PATCH', body: JSON.stringify(status) }),
    drift: (worldId, event, apiConfig) =>
        apiFetch(`${BASE(worldId)}/drift`, { method: 'POST', body: JSON.stringify({ event, apiConfig }) }),
    addItem: (worldId, item) =>
        apiFetch(`${BASE(worldId)}/inventory`, { method: 'POST', body: JSON.stringify(item) }),
    deleteItem: (worldId, itemId) =>
        apiFetch(`${BASE(worldId)}/inventory/${itemId}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2: Add fire-and-forget trigger in `WorldPage.jsx`**

In `frontend/src/pages/WorldPage.jsx`, inside `handleEventAccepted`, after the npc-drift block (after line 140):

```js
// Fire-and-forget: update player status if event affects player
if (eventDraft.affected_characters?.includes('__player__')) {
  playerApi.drift(worldId, eventDraft, apiConfig)
    .then(({ player: updatedPlayer }) => { if (mountedRef.current) setPlayer(updatedPlayer); })
    .catch((err) => console.warn('[WorldPage] player-drift failed:', err.message));
}
```

Note: the backend returns `{ player }`, so destructure as `{ player: updatedPlayer }`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/player.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: trigger player status drift after event confirm"
```

---

### Task 3: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run frontend build**

```bash
cd frontend && npm run build
```

Expected output:
```
✓ built in ...
```

No TypeScript/JSX errors. If errors appear, fix them before proceeding.

- [ ] **Step 2: Commit if any fixes were needed**

Only if build required fixes:
```bash
git add -p
git commit -m "fix: resolve build errors in player-drift integration"
```
