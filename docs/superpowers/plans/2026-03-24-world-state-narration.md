# World State Narration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-update `world.current_state.summary` via LLM each time a player confirms an event, so the world's narrative state evolves and feeds back into the chat system prompt.

**Architecture:** Frontend fire-and-forget pattern — `handleEventAccepted` calls a new `/narrate` endpoint after every confirmed event. The backend reads the world, calls LLM, writes the new summary back, and returns the updated world. `context.js` is extended to include `current_state.summary` in the world base section so the new summary immediately appears in the next turn's system prompt.

**Tech Stack:** Express.js, React, file-based JSON storage, OpenAI-compatible LLM API

**Spec:** `docs/superpowers/specs/2026-03-24-world-state-narration-design.md`

---

## File Structure

| File | Change |
|------|--------|
| `src/endpoints/world-simulation/context.js` | Add `current_state.summary` to `worldBaseText` array |
| `src/endpoints/world-simulation/worlds.js` | Add `POST /:worldId/narrate` route |
| `frontend/src/api/worlds.js` | Add `narrate` method |
| `frontend/src/pages/WorldPage.jsx` | Add `mountedRef`, trigger `narrate` in `handleEventAccepted` |

---

## Task 1: Inject `current_state.summary` into context builder

**Files:**
- Modify: `src/endpoints/world-simulation/context.js:50-57`

**Context:** `worldBaseText` is an array of strings (lines 50-57). It currently contains `foundation.background`, `foundation.geography`, `foundation.rules`, and `power_system` fields. We need to add `current_state.summary` so narrated updates reach the LLM's system prompt.

- [ ] **Step 1: Add `current_state.summary` to `worldBaseText`**

In `src/endpoints/world-simulation/context.js`, replace lines 50-57:

```js
    const worldBaseText = [
        `# World Background\n${worldCard.foundation?.background || ''}`,
        `# Geography\n${worldCard.foundation?.geography || ''}`,
        `# Rules\n${worldCard.foundation?.rules || ''}`,
        `# Power System\n${worldCard.power_system?.description || ''}`,
        worldCard.power_system?.tiers?.map(t => `Level ${t.level} (${t.name}): ${t.description}`).join('\n') || '',
        worldCard.power_system?.constraints ? `Constraints: ${worldCard.power_system.constraints}` : '',
        worldCard.current_state?.summary ? `# 当前世界状态\n${worldCard.current_state.summary}` : '',
    ].filter(Boolean).join('\n\n');
```

- [ ] **Step 2: Commit**

```bash
git add src/endpoints/world-simulation/context.js
git commit -m "feat: include current_state.summary in context world base"
```

---

## Task 2: Backend `/narrate` endpoint

**Files:**
- Modify: `src/endpoints/world-simulation/worlds.js:111` (append after DELETE route)

**Context:** `worlds.js` uses `readWorld`/`writeWorld` (already imported at line 5). `callLLM` is used in `events.js` — you need to import it here too. The existing pattern for LLM endpoints (see `events.js` lines 71-113): validate body → call LLM → parse result → write storage → return. Place this route **before** the file ends, after the DELETE handler.

- [ ] **Step 1: Add `callLLM` import to `worlds.js`**

In `src/endpoints/world-simulation/worlds.js`, add to the imports at the top:

```js
import { callLLM } from './llm-client.js';
```

- [ ] **Step 2: Add the `/narrate` route**

Append after the DELETE route (after line 111):

```js
const NARRATE_SYSTEM = `你是世界叙事者。根据世界背景、当前状态和最新事件，用2~3句中文重写当前状态摘要。只输出摘要文本，不要标题、不要解释。`;

// POST /:worldId/narrate — update world current_state.summary after an event
router.post('/:worldId/narrate', vId, async (req, res) => {
    try {
        const { event, apiConfig = {} } = req.body;
        if (!event?.title) return res.status(400).json({ error: 'missing_fields' });

        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });

        const userMessage = [
            `世界背景：${world.foundation?.background || ''}`,
            `当前状态：${world.current_state?.summary || '（暂无）'}`,
            `最新事件（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`,
        ].join('\n\n');

        let newSummary;
        try {
            newSummary = (await callLLM([{ role: 'user', content: userMessage }], NARRATE_SYSTEM, apiConfig)).trim();
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        if (!newSummary) return res.json(world);

        const updated = {
            ...world,
            current_state: {
                ...(world.current_state || {}),
                summary: newSummary,
                last_updated: new Date().toISOString(),
            },
        };
        await writeWorld(req.user.directories, req.params.worldId, updated);
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/worlds.js
git commit -m "feat: POST /worlds/:worldId/narrate — auto-update world summary after event"
```

---

## Task 3: Frontend — API method + trigger in WorldPage

**Files:**
- Modify: `frontend/src/api/worlds.js:23`
- Modify: `frontend/src/pages/WorldPage.jsx`

**Context:** `worldsApi` lives in `frontend/src/api/worlds.js` (lines 5-23). `WorldPage.jsx` imports `useState, useEffect, useCallback, useMemo` from React (line 1) — add `useRef`. `handleEventAccepted` is at lines 102-139 (plain `async function`, not `useCallback`). After the existing `setWorld(freshWorld)` call, add the fire-and-forget narrate trigger.

- [ ] **Step 1: Add `narrate` method to `worldsApi`**

In `frontend/src/api/worlds.js`, replace lines 5-23:

```js
export const worldsApi = {
  list: () => apiFetch(`${BASE}/worlds`),
  get: (id) => apiFetch(`${BASE}/worlds/${id}`),
  create: (world) => apiFetch(`${BASE}/worlds`, { method: 'POST', body: JSON.stringify(world) }),
  update: (id, world) => apiFetch(`${BASE}/worlds/${id}`, { method: 'PUT', body: JSON.stringify(world) }),
  delete: (id) => apiFetch(`${BASE}/worlds/${id}`, { method: 'DELETE' }),

  exportWorld: (worldId) => apiFetch(`${BASE}/worlds/${worldId}/export`),
  importWorld: (bundle) => apiFetch(`${BASE}/worlds/import`, { method: 'POST', body: JSON.stringify(bundle) }),

  generateDraft: (description, apiConfig, scale) =>
    apiFetch(`${BASE}/generate/world`, { method: 'POST', body: JSON.stringify({ description, apiConfig, scale }) }),

  refineDraft: (draft, section, instruction, apiConfig) =>
    apiFetch(`${BASE}/generate/world/refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, instruction, apiConfig }),
    }),

  narrate: (worldId, event, apiConfig) =>
    apiFetch(`${BASE}/worlds/${worldId}/narrate`, {
      method: 'POST',
      body: JSON.stringify({ event, apiConfig }),
    }),
};
```

- [ ] **Step 2: Add `useRef` to React import in `WorldPage.jsx`**

In `frontend/src/pages/WorldPage.jsx` line 1, replace:

```js
import { useState, useEffect, useCallback, useMemo } from 'react';
```

with:

```js
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
```

- [ ] **Step 3: Add `mountedRef` to `WorldPage` component**

Inside the `WorldPage` component body, after the existing `useState` declarations (around line 44), add:

```js
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
```

- [ ] **Step 4: Trigger narration in `handleEventAccepted`**

In `handleEventAccepted`, after `if (freshWorld) setWorld(freshWorld);`, add:

```js
    // Fire-and-forget: update world narrative summary
    worldsApi.narrate(worldId, eventDraft, apiConfig)
      .then((narratedWorld) => { if (mountedRef.current) setWorld(narratedWorld); })
      .catch((err) => console.warn('[WorldPage] narrate failed:', err.message));
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/worlds.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: trigger world narration after event confirm"
```

---

## Task 4: Build verification

- [ ] **Step 1: Run frontend build**

```bash
cd frontend && npm run build
```

Expected: `✓ built in ...` with no errors or warnings about missing imports.

- [ ] **Step 2: Commit if build output files changed**

```bash
git add -A
git commit -m "chore: build verification"
```
