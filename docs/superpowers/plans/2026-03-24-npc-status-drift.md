# NPC Status Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each confirmed event, automatically LLM-update the `current_state.status` of affected active NPCs so character states evolve with the story.

**Architecture:** Frontend fire-and-forget pattern — `handleEventAccepted` calls `POST /worlds/:worldId/npc-drift` with the event and visible character IDs. The backend intersects these with the event's `affected_characters`, calls LLM in parallel for each match, writes updated statuses back to disk, and returns the updated characters. The frontend merges the result into local `characters` state.

**Tech Stack:** Express.js, React, file-based JSON storage, OpenAI-compatible LLM API

**Spec:** `docs/superpowers/specs/2026-03-24-npc-status-drift-design.md`

---

## File Structure

| File | Change |
|------|--------|
| `src/endpoints/world-simulation/worlds.js` | Add `readCharacter` import; append `POST /:worldId/npc-drift` route |
| `frontend/src/api/worlds.js` | Add `npcDrift` method |
| `frontend/src/pages/WorldPage.jsx` | Add `npcDrift` fire-and-forget trigger in `handleEventAccepted` |

---

## Task 1: Backend `/npc-drift` endpoint

**Files:**
- Modify: `src/endpoints/world-simulation/worlds.js:6` (import) and end of file (new route)

**Context:** `worlds.js` currently imports `listCharacters, writeCharacter` from `./storage/characters.js` (line 6) but NOT `readCharacter`. `callLLM` is already imported (line 9). `vId` middleware is defined at line 66. The last route is `POST /:worldId/narrate` which ends around line 154. Append the new route after it.

- [ ] **Step 1: Update the characters import on line 6**

Replace:
```js
import { listCharacters, writeCharacter } from './storage/characters.js';
```
With:
```js
import { listCharacters, readCharacter, writeCharacter } from './storage/characters.js';
```

- [ ] **Step 2: Append the `NPC_DRIFT_SYSTEM` constant and route after the narrate route**

```js
const NPC_DRIFT_SYSTEM = `你是世界叙事者。根据事件和角色当前状态，用1~2句中文更新角色的当前状态描述。只输出状态文本，不要标题、不要解释。`;

const SAFE_ID = /^[\w-]{1,64}$/;

// POST /:worldId/npc-drift — update affected active NPC statuses after an event
router.post('/:worldId/npc-drift', vId, async (req, res) => {
    try {
        const { event, activeCharacterIds, apiConfig = {} } = req.body;
        if (!event?.title || !Array.isArray(activeCharacterIds) || activeCharacterIds.length === 0) {
            return res.status(400).json({ error: 'missing_fields' });
        }

        const affected = Array.isArray(event.affected_characters) ? event.affected_characters : [];
        const targetIds = affected
            .filter(id => activeCharacterIds.includes(id))
            .filter(id => SAFE_ID.test(id));

        if (targetIds.length === 0) return res.json({ updated: [] });

        const results = await Promise.all(targetIds.map(async (charId) => {
            try {
                const char = await readCharacter(req.user.directories, charId);
                if (!char) return null;

                const userMessage = [
                    `角色：${char.name}`,
                    `当前状态：${char.current_state?.status || '（正常）'}`,
                    `性格：${char.identity?.personality || ''}`,
                    `事件（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`,
                ].join('\n');

                let newStatus;
                try {
                    newStatus = (await callLLM([{ role: 'user', content: userMessage }], NPC_DRIFT_SYSTEM, apiConfig)).trim();
                } catch (err) {
                    console.warn(`[npc-drift] LLM failed for ${charId}:`, err.message);
                    return null;
                }

                if (!newStatus) return null;

                const updated = {
                    ...char,
                    current_state: {
                        ...(char.current_state || {}),
                        status: newStatus,
                        last_updated: new Date().toISOString(),
                    },
                };
                await writeCharacter(req.user.directories, charId, updated);
                const { hidden_traits, ...safe } = updated;
                return safe;
            } catch (err) {
                console.warn(`[npc-drift] failed for ${charId}:`, err.message);
                return null;
            }
        }));

        res.json({ updated: results.filter(Boolean) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/worlds.js
git commit -m "feat: POST /worlds/:worldId/npc-drift — update active NPC statuses after event"
```

---

## Task 2: Frontend — API method + WorldPage trigger

**Files:**
- Modify: `frontend/src/api/worlds.js:29` (append `npcDrift` before closing `}`)
- Modify: `frontend/src/pages/WorldPage.jsx:128` (after the existing `narrate` call)

**Context:**
- `worldsApi` object ends at line 29 (`};`). Add `npcDrift` after `narrate` (line 24-28).
- `handleEventAccepted` is at lines 107-147. The `narrate` fire-and-forget call is at lines 126-128. Add the `npcDrift` call immediately after it (after line 128).
- `visibleCharacters` is computed at lines 202-210 in the render body. It's accessible via closure at the time `handleEventAccepted` is called (component is mounted and has rendered). No need to recompute.
- `mountedRef` already exists (added in the narrate feature).

- [ ] **Step 1: Add `npcDrift` to `worldsApi`**

In `frontend/src/api/worlds.js`, replace the closing of the object:
```js
  narrate: (worldId, event, apiConfig) =>
    apiFetch(`${BASE}/worlds/${worldId}/narrate`, {
      method: 'POST',
      body: JSON.stringify({ event, apiConfig }),
    }),
};
```
With:
```js
  narrate: (worldId, event, apiConfig) =>
    apiFetch(`${BASE}/worlds/${worldId}/narrate`, {
      method: 'POST',
      body: JSON.stringify({ event, apiConfig }),
    }),

  npcDrift: (worldId, event, activeCharacterIds, apiConfig) =>
    apiFetch(`${BASE}/worlds/${worldId}/npc-drift`, {
      method: 'POST',
      body: JSON.stringify({ event, activeCharacterIds, apiConfig }),
    }),
};
```

- [ ] **Step 2: Add `npcDrift` trigger in `handleEventAccepted`**

In `frontend/src/pages/WorldPage.jsx`, after the lines:
```js
    // Fire-and-forget: update world narrative summary
    worldsApi.narrate(worldId, eventDraft, apiConfig)
      .then((narratedWorld) => { if (mountedRef.current) setWorld(narratedWorld); })
      .catch((err) => console.warn('[WorldPage] narrate failed:', err.message));
```
Add:
```js
    // Fire-and-forget: update affected NPC statuses
    const activeCharacterIds = visibleCharacters.map(c => c.id);
    worldsApi.npcDrift(worldId, eventDraft, activeCharacterIds, apiConfig)
      .then(({ updated }) => {
        if (!mountedRef.current || updated.length === 0) return;
        setCharacters(prev => prev.map(c => {
          const upd = updated.find(u => u.id === c.id);
          return upd ? { ...c, current_state: upd.current_state } : c;
        }));
      })
      .catch((err) => console.warn('[WorldPage] npc-drift failed:', err.message));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/worlds.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: trigger NPC status drift after event confirm"
```

---

## Task 3: Build verification

- [ ] **Step 1: Run frontend build**

```bash
cd frontend && npm run build
```

Expected: `✓ built in ...` with no errors.

- [ ] **Step 2: Manual smoke-test (optional)**

Accept an event in-game where `affected_characters` overlaps with the currently visible NPCs. Check that the affected NPC's `current_state.status` is updated in the character file on disk and reflected in `CharacterProfilePanel`.
