# Event Propose Character Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the event-proposal LLM the `"__player__"` convention and provide it with character IDs so `affected_characters` is populated correctly, enabling player/NPC drift triggers to fire.

**Architecture:** Pass `activeCharacters` ({id, name} list) from frontend to the propose endpoint. Backend appends the list to the LLM user message and updates `PROPOSE_SYSTEM` to explain both the `"__player__"` special token and that NPC IDs should come from the provided list.

**Tech Stack:** Express (backend), React (frontend)

---

## File Map

| File | Change |
|------|--------|
| `src/endpoints/world-simulation/events.js` | Update `PROPOSE_SYSTEM`; accept `activeCharacters` in propose route; include in LLM user message |
| `frontend/src/api/events.js` | Add `activeCharacters` param to `propose` method |
| `frontend/src/pages/WorldPage.jsx` | Pass `characters` (mapped to id+name) in `handleTurnComplete`; add `characters` to useCallback deps |

---

### Task 1: Backend — update PROPOSE_SYSTEM + include character list in propose

**Files:**
- Modify: `src/endpoints/world-simulation/events.js` (lines 65–69, 74–116)

**Current `PROPOSE_SYSTEM` (line 65–69):**
```js
const PROPOSE_SYSTEM = `You are a world narrator. Analyze the provided chat history.
If a significant world-changing event occurred, respond with JSON:
{"significant":true,"title":"...","description":"...","impact_scope":"minor|moderate|major","affected_characters":[],"narrative":"叙事化的中文提示，以"冥冥中"开头"}
If nothing significant occurred, respond with JSON: {"significant":false}
Only respond with JSON, no other text.`;
```

- [ ] **Step 1: Replace `PROPOSE_SYSTEM` with updated version**

```js
const PROPOSE_SYSTEM = `You are a world narrator. Analyze the provided chat history.
If a significant world-changing event occurred, respond with JSON:
{"significant":true,"title":"...","description":"...","impact_scope":"minor|moderate|major","affected_characters":[...],"narrative":"叙事化的中文提示，以"冥冥中"开头"}
Rules for affected_characters:
- Use "__player__" if the player character is directly involved in the event.
- Use character IDs (from the provided character list) for any NPCs directly involved.
- Leave the array empty if no specific character is involved.
If nothing significant occurred, respond with JSON: {"significant":false}
Only respond with JSON, no other text.`;
```

- [ ] **Step 2: Update the propose route to accept and use `activeCharacters`**

Current route destructures (line 76):
```js
const { chatHistory, apiConfig = {} } = req.body;
```

Change to:
```js
const { chatHistory, activeCharacters, apiConfig = {} } = req.body;
```

Current user message (line 81):
```js
const messages = [{ role: 'user', content: JSON.stringify(chatHistory) }];
```

Replace with:
```js
const charList = Array.isArray(activeCharacters) && activeCharacters.length > 0
    ? activeCharacters.map(c => `${c.name} (id: ${c.id})`).join(', ')
    : null;
const content = charList
    ? `Active characters: ${charList}\n\n${JSON.stringify(chatHistory)}`
    : JSON.stringify(chatHistory);
const messages = [{ role: 'user', content }];
```

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/events.js
git commit -m "feat: teach event proposal LLM __player__ convention and character IDs"
```

---

### Task 2: Frontend — update propose API + pass characters from WorldPage

**Files:**
- Modify: `frontend/src/api/events.js` (line 11–15)
- Modify: `frontend/src/pages/WorldPage.jsx` (lines 183, 211)

- [ ] **Step 1: Add `activeCharacters` param to `eventsApi.propose`**

Current (`frontend/src/api/events.js` line 11–15):
```js
propose: (worldId, chatHistory, apiConfig) =>
    apiFetch(`${BASE(worldId)}/propose`, {
        method: 'POST',
        body: JSON.stringify({ chatHistory, apiConfig }),
    }),
```

Replace with:
```js
propose: (worldId, chatHistory, activeCharacters, apiConfig) =>
    apiFetch(`${BASE(worldId)}/propose`, {
        method: 'POST',
        body: JSON.stringify({ chatHistory, activeCharacters, apiConfig }),
    }),
```

- [ ] **Step 2: Update `handleTurnComplete` in `WorldPage.jsx`**

Current call (line 183):
```js
const result = await eventsApi.propose(worldId, recentMessages, apiConfig);
```

Replace with (pass all characters as id+name pairs):
```js
const activeCharacters = characters.map(c => ({ id: c.id, name: c.name }));
const result = await eventsApi.propose(worldId, recentMessages, activeCharacters, apiConfig);
```

Current dependency array (line 211):
```js
}, [worldId, selectedCharacterId, incrementTurns, setProposing, setPendingProposal, apiConfig]);
```

Replace with (add `characters`):
```js
}, [worldId, selectedCharacterId, incrementTurns, setProposing, setPendingProposal, apiConfig, characters]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/events.js frontend/src/pages/WorldPage.jsx
git commit -m "feat: pass character list to event proposal for affected_characters context"
```

---

### Task 3: Build verification

**Files:** None (verification only)

- [ ] **Step 1: Run frontend build**

```bash
cd frontend && npm run build
```

Expected:
```
✓ built in ...
```

No errors. If errors appear, fix before proceeding.

- [ ] **Step 2: Commit fixes if needed**

Only if build required changes:
```bash
git add -p
git commit -m "fix: resolve build errors in event propose character context"
```
