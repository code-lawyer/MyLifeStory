# Relationship Event Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a player confirms an event, automatically update familiarity between the player and affected NPCs using LLM-generated deltas (-5 to +5).

**Architecture:** New `POST /relationships/:worldId/event-drift` endpoint accepts an event + affected character IDs, reads current familiarity from storage, asks LLM for a delta per character, merges results, then writes once (only if any LLM calls succeeded). Frontend calls it fire-and-forget from `handleEventAccepted`, same pattern as npc-drift and player-drift.

**Tech Stack:** Node.js/Express (backend), React (frontend), Jest integration tests

---

## File Map

- **Modify:** `src/endpoints/world-simulation/relationships.js` — add `POST /:worldId/event-drift` route
- **Modify:** `frontend/src/api/relationships.js` — add `eventDrift` method
- **Modify:** `frontend/src/pages/WorldPage.jsx` — call `eventDrift` fire-and-forget in `handleEventAccepted`
- **Create:** `tests/world-simulation/relationships.test.js` — integration tests for new endpoint

---

### Task 1: Backend — `POST /:worldId/event-drift` endpoint

**Files:**
- Modify: `src/endpoints/world-simulation/relationships.js`
- Create: `tests/world-simulation/relationships.test.js`

#### Background

`relationships.js` already has:
- `GET /:worldId` — returns all relationships with dark_revealed computed
- `POST /:worldId/:charId/evaluate` — chat-based familiarity delta (1–5)
- `readRelationships` / `writeRelationships` from `./storage/relationships.js`
- `stripFences` from `./prompts.js`
- `callLLM` from `./llm-client.js`

Test files import `setLLMAdapter` from `../../src/endpoints/world-simulation/llm-client.js` to inject a mock adapter — this is the standard pattern for testing LLM endpoints (see `tests/world-simulation/events.test.js`).

The endpoint must:
1. Validate `event.title` and `affectedCharIds` (array, non-empty)
2. Filter out `__player__` and invalid IDs using `SAFE_ID = /^[\w-]{1,64}$/`
3. Read relationships file once upfront
4. Run LLM calls in parallel (one per char)
5. Collect successes, merge into `data.relationships` in a single synchronous pass
6. Write once — only if at least one LLM call succeeded
7. Return `{ updated: [{ charId, familiarity, delta }] }`

- [ ] **Step 1: Write the failing test**

Create `tests/world-simulation/relationships.test.js`:

```js
import { describe, test, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server, tmpDir, dirs;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ws-rels-'));
  dirs = { relationships: path.join(tmpDir, 'relationships') };
  fs.mkdirSync(dirs.relationships, { recursive: true });
  const { router } = await import('../../src/endpoints/world-simulation/relationships.js');
  server = await startTestServer(router, dirs);
});

afterEach(async () => {
  await server.stop();
  await rm(tmpDir, { recursive: true });
  setLLMAdapter(null);
});

describe('POST /:worldId/event-drift', () => {
  test('returns 400 when affectedCharIds is missing', async () => {
    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { title: 'Test' } }), // missing affectedCharIds
    });
    expect(res.status).toBe(400);
  });

  test('returns 400 when affectedCharIds is empty array', async () => {
    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { title: 'Test' }, affectedCharIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  test('returns { updated: [] } when no valid char IDs survive filtering', async () => {
    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Fight', description: 'A brawl', impact_scope: 'moderate' },
        affectedCharIds: ['__player__', '../evil', ''],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: [] });
  });

  test('applies LLM delta and persists updated familiarity', async () => {
    // Seed familiarity at 50
    const relPath = path.join(dirs.relationships, 'rel_world_001.json');
    fs.writeFileSync(relPath, JSON.stringify({
      relationships: { char_001: { familiarity: 50, last_interaction: '2026-01-01T00:00:00.000Z' } }
    }));

    setLLMAdapter(async () => JSON.stringify({ delta: 3 }));

    const res = await fetch(`${server.url}/world_001/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Rescued', description: 'Player saved char', impact_scope: 'moderate' },
        affectedCharIds: ['char_001'],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated).toHaveLength(1);
    expect(data.updated[0]).toMatchObject({ charId: 'char_001', familiarity: 53, delta: 3 });

    // Verify persisted to disk
    const persisted = JSON.parse(fs.readFileSync(relPath, 'utf8'));
    expect(persisted.relationships.char_001.familiarity).toBe(53);
  });

  test('clamps familiarity to 100 when delta would exceed maximum', async () => {
    const relPath = path.join(dirs.relationships, 'rel_world_002.json');
    fs.writeFileSync(relPath, JSON.stringify({
      relationships: { char_002: { familiarity: 98 } }
    }));

    setLLMAdapter(async () => JSON.stringify({ delta: 5 }));

    const res = await fetch(`${server.url}/world_002/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Bond', description: 'Deep trust established', impact_scope: 'major' },
        affectedCharIds: ['char_002'],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated[0].familiarity).toBe(100);
  });

  test('clamps familiarity to 0 when delta would go below minimum', async () => {
    const relPath = path.join(dirs.relationships, 'rel_world_003.json');
    fs.writeFileSync(relPath, JSON.stringify({
      relationships: { char_003: { familiarity: 2 } }
    }));

    setLLMAdapter(async () => JSON.stringify({ delta: -5 }));

    const res = await fetch(`${server.url}/world_003/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Betrayal', description: 'Trust broken', impact_scope: 'major' },
        affectedCharIds: ['char_003'],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.updated[0].familiarity).toBe(0);
  });

  test('skips char gracefully when LLM fails, does not write file', async () => {
    const relPath = path.join(dirs.relationships, 'rel_world_004.json');
    const original = { relationships: { char_004: { familiarity: 40 } } };
    fs.writeFileSync(relPath, JSON.stringify(original));

    setLLMAdapter(async () => { throw new Error('LLM unavailable'); });

    const res = await fetch(`${server.url}/world_004/event-drift`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: { title: 'Fight', description: 'Clash', impact_scope: 'minor' },
        affectedCharIds: ['char_004'],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: [] });

    // File unchanged
    const persisted = JSON.parse(fs.readFileSync(relPath, 'utf8'));
    expect(persisted.relationships.char_004.familiarity).toBe(40);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/c/Users/lanzh/Documents/Vibe Coding Works/MyLifeStory"
npm run test:ws -- --testPathPattern=relationships
```
Expected: FAIL — "Cannot POST /world_001/event-drift" (route doesn't exist yet)

- [ ] **Step 3: Add `POST /:worldId/event-drift` to `relationships.js`**

Add at the end of `src/endpoints/world-simulation/relationships.js`, before the final blank line:

```js
const EVENT_DRIFT_SYSTEM = `你是关系分析师。根据事件，判断玩家与该角色的熟悉度变化。
返回JSON：{"delta": N}，N为-5到5的整数。正数表示关系改善，负数表示关系恶化。
只输出JSON，不要解释。`;

const SAFE_ID_REL = /^[\w-]{1,64}$/;

// POST /:worldId/event-drift — update familiarity for affected chars after an event
router.post('/:worldId/event-drift', vId, async (req, res) => {
  try {
    const { event, affectedCharIds, apiConfig = {} } = req.body;
    if (!event?.title || !Array.isArray(affectedCharIds) || affectedCharIds.length === 0) {
      return res.status(400).json({ error: 'missing_fields' });
    }

    const targetIds = affectedCharIds
      .filter(id => id !== '__player__')
      .filter(id => SAFE_ID_REL.test(id));

    if (targetIds.length === 0) return res.json({ updated: [] });

    const dirs = req.user.directories;
    const data = await readRelationships(dirs, req.params.worldId);

    // Run LLM calls in parallel; collect results (null = skipped)
    const results = await Promise.all(targetIds.map(async (charId) => {
      try {
        const currentFamiliarity = data.relationships?.[charId]?.familiarity ?? 0;
        const userMessage = [
          `角色ID：${charId}`,
          `当前熟悉度：${currentFamiliarity}/100`,
          `事件（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`,
        ].join('\n');

        const raw = await callLLM([{ role: 'user', content: userMessage }], EVENT_DRIFT_SYSTEM, apiConfig);
        const parsed = JSON.parse(stripFences(raw));
        const delta = Math.max(-5, Math.min(5, parseInt(parsed.delta) || 0));
        const newFamiliarity = Math.max(0, Math.min(100, currentFamiliarity + delta));
        return { charId, familiarity: newFamiliarity, delta, prev: data.relationships?.[charId] || {} };
      } catch {
        return null; // LLM failed or parse failed — skip this char
      }
    }));

    const succeeded = results.filter(Boolean);

    if (succeeded.length > 0) {
      // Merge all updates into data synchronously, then write once
      if (!data.relationships) data.relationships = {};
      for (const { charId, familiarity, prev } of succeeded) {
        data.relationships[charId] = { ...prev, familiarity, last_interaction: new Date().toISOString() };
      }
      await writeRelationships(dirs, req.params.worldId, data);
    }

    res.json({ updated: succeeded.map(({ charId, familiarity, delta }) => ({ charId, familiarity, delta })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/c/Users/lanzh/Documents/Vibe Coding Works/MyLifeStory"
npm run test:ws -- --testPathPattern=relationships
```
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add tests/world-simulation/relationships.test.js src/endpoints/world-simulation/relationships.js
git commit -m "feat: POST /relationships/:worldId/event-drift — update familiarity after event"
```

---

### Task 2: Frontend — `relationshipsApi.eventDrift` + `WorldPage` trigger

**Files:**
- Modify: `frontend/src/api/relationships.js`
- Modify: `frontend/src/pages/WorldPage.jsx`

#### Background

`frontend/src/api/relationships.js` currently exports:
```js
export const relationshipsApi = {
  get: (worldId) => apiFetch(`${BASE}/${worldId}`),
  evaluate: (worldId, charId, messages, apiConfig) => ...
};
```

`handleEventAccepted` in `WorldPage.jsx` already has fire-and-forget blocks for narrate, npcDrift, and player-drift. Add relationship drift after the player-drift block.

Filter for `affectedNpcIds`: IDs in `eventDraft.affected_characters` that are NOT `__player__` AND that appear in `visibleCharacters`. This is stricter than the existing npcDrift call (line 143) which passes all visible IDs regardless of `affected_characters`.

After the call resolves, update `relationships` state to reflect new familiarity values — so `CharacterSelector` shows the updated state immediately without a full reload.

- [ ] **Step 1: Add `eventDrift` to `frontend/src/api/relationships.js`**

```js
eventDrift: (worldId, event, affectedCharIds, apiConfig) =>
  apiFetch(`${BASE}/${worldId}/event-drift`, {
    method: 'POST',
    body: JSON.stringify({ event, affectedCharIds, apiConfig }),
  }),
```

- [ ] **Step 2: Add fire-and-forget call in `handleEventAccepted` in `WorldPage.jsx`**

Insert immediately after the closing `}` of the player-drift block and before the comment `// Add event to local state`. The exact anchor to match in the file is:

```js
        .catch((err) => console.warn('[WorldPage] player-drift failed:', err.message));
    }

    // Add event to local state
```

Replace that with:

```js
        .catch((err) => console.warn('[WorldPage] player-drift failed:', err.message));
    }

    // Fire-and-forget: update familiarity for affected NPCs
    const affectedNpcIds = (eventDraft.affected_characters || [])
      .filter(id => id !== '__player__')
      .filter(id => visibleCharacters.some(c => c.id === id));
    if (affectedNpcIds.length > 0) {
      relationshipsApi.eventDrift(worldId, eventDraft, affectedNpcIds, apiConfig)
        .then(({ updated }) => {
          if (!mountedRef.current || updated.length === 0) return;
          setRelationships(prev => {
            const next = { ...prev };
            for (const { charId, familiarity } of updated) {
              next[charId] = { ...(next[charId] || {}), familiarity, last_interaction: new Date().toISOString() };
            }
            return next;
          });
        })
        .catch((err) => console.warn('[WorldPage] relationship event-drift failed:', err.message));
    }

    // Add event to local state
```

- [ ] **Step 3: Run frontend build to verify no errors**

```bash
cd "/c/Users/lanzh/Documents/Vibe Coding Works/MyLifeStory"
npm run build:frontend
```
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/relationships.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: fire-and-forget relationship event-drift after event confirm"
```
