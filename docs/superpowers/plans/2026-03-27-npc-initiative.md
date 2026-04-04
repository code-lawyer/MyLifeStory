# NPC Initiative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the player enters a scene, an NPC in that scene may spontaneously say something — a one-line greeting, observation, or remark — injected directly into the chat as if the NPC just spoke up unprompted.

**Architecture:** A new `POST /chat/:worldId/npc-init` route calls the LLM with scene + character info and returns `{ characterId, characterName, message }` or nulls. `chatStore` gets a new `addNpcMessage` method that opens a new character block with the NPC's message. The frontend calls this fire-and-forget at the end of `handleSceneEnter`, after the scene-entry system message is already in place.

**Tech Stack:** Express (backend), React + Zustand (frontend), Jest (tests)

---

## File Map

| File | Change |
|------|--------|
| `src/endpoints/world-simulation/chat.js` | Add `callLLM` + `parseLLMJson` imports, `NPC_INIT_SYSTEM` const, `POST /:worldId/npc-init` route |
| `frontend/src/stores/chatStore.js` | Add `addNpcMessage(characterId, characterName, message)` method |
| `frontend/src/api/chat.js` | Add `npcInit` named export |
| `frontend/src/pages/WorldPage.jsx` | Import `npcInit`, call in `handleSceneEnter` |
| `tests/world-simulation/chat.test.js` | Add 3 npc-init tests |

---

### Task 1: Backend — `POST /chat/:worldId/npc-init`

**Files:**
- Modify: `tests/world-simulation/chat.test.js`
- Modify: `src/endpoints/world-simulation/chat.js`

- [ ] **Step 1: Write failing tests**

Append at the end of `tests/world-simulation/chat.test.js` (after the last `test(...)` block):

```js
describe('POST /:worldId/npc-init', () => {
    test('returns characterId and message when LLM triggers NPC', async () => {
        setLLMAdapter(async () => JSON.stringify({
            trigger: true,
            character_id: 'char_abc',
            character_name: 'Ada',
            message: '你终于来了。',
        }));
        const res = await fetch(`${url}/w1/npc-init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scene: { id: 's1', name: '酒馆', description: '嘈杂的地方' },
                characters: [{ id: 'char_abc', name: 'Ada', voice: { style: '冷淡' }, current_state: { status: '候客' }, identity: { description: '神秘女侠' } }],
                worldState: { summary: '王国动荡' },
                clock: { day: 2, period: 'evening' },
                apiConfig: {},
            }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.characterId).toBe('char_abc');
        expect(json.characterName).toBe('Ada');
        expect(json.message).toBe('你终于来了。');
    });

    test('returns null fields when LLM decides no trigger', async () => {
        setLLMAdapter(async () => JSON.stringify({ trigger: false }));
        const res = await fetch(`${url}/w1/npc-init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                scene: { id: 's1', name: '荒野', description: '' },
                characters: [{ id: 'c1', name: 'Bob', voice: {}, current_state: {}, identity: {} }],
                apiConfig: {},
            }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.characterId).toBeNull();
        expect(json.message).toBeNull();
    });

    test('returns 400 when scene or characters missing', async () => {
        const res = await fetch(`${url}/w1/npc-init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characters: [] }),
        });
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:ws -- --testPathPattern="chat.test" 2>&1 | tail -15
```

Expected: 3 new tests fail (route not found / 404).

- [ ] **Step 3: Add imports to `chat.js`**

In `src/endpoints/world-simulation/chat.js`, change the import block from:

```js
// src/endpoints/world-simulation/chat.js
import express from 'express';
import { streamLLM } from './llm-client.js';
import { validateIdParams } from './validate-id.js';
```

To:

```js
// src/endpoints/world-simulation/chat.js
import express from 'express';
import { streamLLM, callLLM } from './llm-client.js';
import { parseLLMJson } from './llm-helpers.js';
import { validateIdParams } from './validate-id.js';
```

- [ ] **Step 4: Add `npc-init` route to `chat.js`**

Append at the end of `src/endpoints/world-simulation/chat.js` (after the existing SSE route's closing `res.end();`):

```js
const NPC_INIT_SYSTEM = `你是世界叙事者。玩家刚刚进入了一个场景，判断是否有NPC应该主动向玩家搭话。
约50%的场合下触发。如果触发，选择最适合开口的NPC，用TA的语气说一句话（中文，30字以内，自然口语，不要解释性文字）。
返回JSON：{"trigger":true,"character_id":"...","character_name":"...","message":"..."}
或：{"trigger":false}
只返回JSON，不要解释。`;

// POST /:worldId/npc-init — NPC may spontaneously speak on scene entry
router.post('/:worldId/npc-init', validateIdParams('worldId'), async (req, res) => {
    const { scene, characters, worldState, clock, apiConfig = {} } = req.body;
    if (!scene || !Array.isArray(characters) || characters.length === 0) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    const periodLabel = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };
    const timeStr = clock ? `第${clock.day}天·${periodLabel[clock.period] || clock.period}` : '';

    const charList = characters.map(c =>
        `- ${c.name}（ID:${c.id}）：${c.current_state?.status || c.identity?.description?.slice(0, 40) || ''}，语气：${c.voice?.style || '中性'}`
    ).join('\n');

    const userMessage = [
        `场景：${scene.name} — ${scene.description || ''}`,
        timeStr ? `当前时间：${timeStr}` : '',
        worldState?.summary ? `世界状态：${worldState.summary}` : '',
        `场景中的角色：\n${charList}`,
    ].filter(Boolean).join('\n');

    let raw;
    try {
        raw = await callLLM([{ role: 'user', content: userMessage }], NPC_INIT_SYSTEM, apiConfig);
    } catch {
        return res.json({ characterId: null, characterName: null, message: null });
    }

    let parsed;
    try { parsed = parseLLMJson(raw); } catch {
        return res.json({ characterId: null, characterName: null, message: null });
    }

    if (!parsed.trigger || !parsed.character_id || !parsed.message) {
        return res.json({ characterId: null, characterName: null, message: null });
    }

    res.json({
        characterId: parsed.character_id,
        characterName: parsed.character_name || '',
        message: parsed.message,
    });
});
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm run test:ws -- --testPathPattern="chat.test" 2>&1 | tail -15
```

Expected: all 6 chat tests pass (3 existing + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/endpoints/world-simulation/chat.js tests/world-simulation/chat.test.js
git commit -m "feat: POST /chat/:worldId/npc-init — NPC spontaneously greets player on scene entry"
```

---

### Task 2: Frontend — chatStore, API, and WorldPage wiring

**Files:**
- Modify: `frontend/src/stores/chatStore.js`
- Modify: `frontend/src/api/chat.js`
- Modify: `frontend/src/pages/WorldPage.jsx`

- [ ] **Step 1: Add `addNpcMessage` to chatStore**

In `frontend/src/stores/chatStore.js`, find the `addSystemMessage` method:

```js
  addSystemMessage(text) {
    const id = crypto.randomUUID();
    set((s) => ({
      blocks: [...s.blocks, { id, characterId: '__system__', characterName: null, messages: [{ role: 'assistant', content: text }] }],
    }));
  },
```

Add `addNpcMessage` immediately after it:

```js
  addNpcMessage(characterId, characterName, message) {
    const id = crypto.randomUUID();
    set((s) => ({
      blocks: [...s.blocks, {
        id,
        characterId,
        characterName,
        messages: [{ role: 'assistant', content: message }],
      }],
    }));
  },
```

- [ ] **Step 2: Add `npcInit` to frontend chat API**

In `frontend/src/api/chat.js`, append after the `streamChat` export:

```js
export async function npcInit(worldId, payload) {
    return apiFetch(`/api/world-sim/chat/${worldId}/npc-init`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
```

Note: `apiFetch` is not imported in `chat.js` — it uses `getCsrfToken` + raw `fetch` for SSE. Import `apiFetch` by adding this import at the top of `frontend/src/api/chat.js`:

```js
import { apiFetch } from './client.js';
```

(Add after the existing `import { getCsrfToken } from './csrf.js';` line.)

- [ ] **Step 3: Import `npcInit` in WorldPage**

In `frontend/src/pages/WorldPage.jsx`, find the imports block and add:

```js
import { npcInit } from '../api/chat.js';
```

(Add after the existing `import { relationshipsApi } from '../api/relationships.js';` line.)

- [ ] **Step 4: Call `npcInit` in `handleSceneEnter`**

In `frontend/src/pages/WorldPage.jsx`, find the end of `handleSceneEnter`. After the `worldsApi.advanceTime` fire-and-forget block (added in the Time System plan), add:

```js
    // Fire-and-forget: NPC may greet the player on scene entry
    const sceneCharIds = new Set(
      (scene.characters_present || []).map(e => (typeof e === 'string' ? e : e.id))
    );
    const initChars = characters.filter(c => sceneCharIds.has(c.id));
    if (initChars.length > 0) {
      npcInit(worldId, {
        scene: { id: scene.id, name: scene.name, description: scene.description },
        characters: initChars.map(c => ({
          id: c.id, name: c.name,
          identity: c.identity,
          current_state: c.current_state,
          voice: c.voice,
        })),
        worldState: world?.current_state,
        clock: world?.clock,
        apiConfig,
      }).then(({ characterId, characterName, message }) => {
        if (!characterId || !message || !mountedRef.current) return;
        useChatStore.getState().addNpcMessage(characterId, characterName, message);
      }).catch(() => {});
    }
```

If the Time System plan has NOT been implemented yet, place this block at the end of `handleSceneEnter`, before the closing `}`, after `setPlayer(...)`.

- [ ] **Step 5: Run frontend build**

```bash
cd frontend && npm run build 2>&1 | tail -15
```

Expected: `✓ built in ...` with no errors. Fix any import/JSX errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/stores/chatStore.js frontend/src/api/chat.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: NPC initiative — NPC may greet player on scene entry"
```

---

### Task 3: Full test suite verification

- [ ] **Step 1: Run all tests**

```bash
npm test 2>&1 | tail -10
```

Expected (if all three plans are complete):
```
Test Suites: 14 passed, 14 total
Tests:       81 passed, 81 total
```

(78 after Heartbeat plan + 3 new npc-init tests)
