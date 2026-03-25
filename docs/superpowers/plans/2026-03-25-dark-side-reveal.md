# Dark-Side Reveal Unlock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a character's familiarity crosses 90 (via evaluate or event-drift), re-fetch relationships from the server and inject a narrative system message into chat: "你与[名字]之间的关系出现了某种裂变……"

**Architecture:** Frontend-only change across 3 files. `chatStore.js` gets a new `addSystemMessage` method. `ChatBlock.jsx` gains a system-block render path. `WorldPage.jsx` adds threshold detection in both familiarity-update callbacks, triggering a single re-fetch and message injection. No backend changes.

**Tech Stack:** React 18, Zustand, Tailwind CSS

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `frontend/src/stores/chatStore.js` | Add `addSystemMessage(text)` method |
| Modify | `frontend/src/components/chat/ChatBlock.jsx` | Early-return render path for `characterId === '__system__'` |
| Modify | `frontend/src/pages/WorldPage.jsx` | Threshold detection + re-fetch + notification in `handleTurnComplete` and `handleEventAccepted` |

---

## Task 1: chatStore — add `addSystemMessage`

**Files:**
- Modify: `frontend/src/stores/chatStore.js`

**Context:** `chatStore.js` is a Zustand store. Its `blocks` array holds `{ id, characterId, characterName, messages }` objects. We need a method that appends a sentinel block with `characterId: '__system__'`. The `ChatBlock.jsx` component will check for this sentinel and render differently (Task 2).

- [ ] **Step 1: Open `frontend/src/stores/chatStore.js` and add the method**

  Add `addSystemMessage` after the `updateLastMessage` method (after line 33):

  ```js
  addSystemMessage(text) {
    const id = crypto.randomUUID();
    set((s) => ({
      blocks: [...s.blocks, { id, characterId: '__system__', characterName: null, messages: [{ role: 'assistant', content: text }] }],
    }));
  },
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/stores/chatStore.js
  git commit -m "feat: add addSystemMessage to chatStore"
  ```

---

## Task 2: ChatBlock — render system blocks

**Files:**
- Modify: `frontend/src/components/chat/ChatBlock.jsx`

**Context:** `ChatBlock.jsx` receives a `block` prop. Currently it always renders a character header (name + export button) and messages. We add an early return at the top of the function: if `block.characterId === '__system__'`, render a centered italic line with no header or export button.

- [ ] **Step 1: Open `frontend/src/components/chat/ChatBlock.jsx` and add the system-block guard**

  Insert after the opening `function ChatBlock({ block, isStreaming, onExport }) {` line (after line 8), before the `return`:

  ```jsx
  if (block.characterId === '__system__') {
    return (
      <div className="px-4 py-2 text-center">
        <p className="text-xs text-ink/40 italic">{block.messages[0]?.content}</p>
      </div>
    );
  }
  ```

- [ ] **Step 2: Run build to verify no type/syntax errors**

  ```bash
  cd frontend && npm run build
  ```

  Expected: build completes with no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/chat/ChatBlock.jsx
  git commit -m "feat: render system blocks in ChatBlock without character header"
  ```

---

## Task 3: WorldPage — threshold detection + re-fetch + notification

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`

**Context:** There are two places where familiarity is updated:

1. **`handleEventAccepted`** (lines 119–197) — calls `relationshipsApi.eventDrift(...)` in a fire-and-forget block (lines 165–178). After the optimistic `setRelationships` call, we need to detect threshold crossings.

2. **`handleTurnComplete`** (lines 207–243, a `useCallback`) — calls `relationshipsApi.evaluate(...)` in a fire-and-forget block (lines 229–241). After the `setRelationships` call, same detection.

**Closure note:** In both callbacks, `relationships` in the closure captures the *pre-call* value. This is exactly `prevFamiliarity` — do not add `relationships` to `handleTurnComplete`'s `useCallback` dependency array. `newFamiliarity` must be read from the API response, not from state (state hasn't updated yet).

### Sub-step A: Extract a helper at the top of the component

Add a `useCallback` helper inside `WorldPage` (after the `mountedRef` block, around line 50). It must be a `useCallback` (not a plain function) so that `handleTurnComplete` can include it in its dep array without invalidating `handleTurnComplete` on every render.

`mountedRef` is a React ref — it is stable and does not need to be in the dep array.

```js
const checkDarkReveal = useCallback(async (crossedCharIds) => {
  if (crossedCharIds.length === 0) return;
  try {
    const freshRels = await relationshipsApi.get(worldId);
    if (!mountedRef.current) return;
    setRelationships(freshRels.relationships || {});
    for (const charId of crossedCharIds) {
      const charName = characters.find(c => c.id === charId)?.name || charId;
      useChatStore.getState().addSystemMessage(`你与${charName}之间的关系出现了某种裂变……`);
    }
  } catch (err) {
    console.warn('[WorldPage] dark reveal re-fetch failed:', err.message);
  }
}, [worldId, characters, setRelationships]);
```

### Sub-step B: Call `checkDarkReveal` in `handleEventAccepted`

The existing event-drift `.then()` block (lines 167–175) currently calls `setRelationships`. Extend it:

```js
// Replace the existing event-drift .then() callback (keep the .catch() unchanged):
.then(({ updated }) => {
  if (!mountedRef.current || updated.length === 0) return;
  setRelationships(prev => {
    const next = { ...prev };
    for (const { charId, familiarity } of updated) {
      next[charId] = { dark_revealed: false, ...(next[charId] || {}), familiarity, last_interaction: new Date().toISOString() };
    }
    return next;
  });
  // Detect dark-side threshold crossings
  const crossed = updated
    .filter(({ charId, familiarity }) => (relationships[charId]?.familiarity ?? 0) < 90 && familiarity >= 90)
    .map(({ charId }) => charId);
  checkDarkReveal(crossed);
})
.catch((err) => console.warn('[WorldPage] relationship event-drift failed:', err.message));
```

Note: `relationships` here is the pre-call closure value — correct for `prevFamiliarity`. The `.catch()` is the existing one — preserve it.

### Sub-step C: Call `checkDarkReveal` in `handleTurnComplete`

The existing evaluate `.then()` block (lines 230–238) currently calls `setRelationships`. Extend it:

```js
// Replace the existing evaluate .then() callback (keep the .catch() unchanged):
.then((evalResult) => {
  setRelationships(prev => ({
    ...prev,
    [selectedCharacterId]: {
      ...(prev[selectedCharacterId] || {}),
      familiarity: evalResult.familiarity,
      last_interaction: new Date().toISOString(),
    },
  }));
  // Detect dark-side threshold crossing
  const prevFamiliarity = relationships[selectedCharacterId]?.familiarity ?? 0;
  if (prevFamiliarity < 90 && evalResult.familiarity >= 90) {
    checkDarkReveal([selectedCharacterId]);
  }
})
.catch((err) => console.warn('[WorldPage] familiarity evaluate failed:', err.message));
```

Note: `relationships` is the stale closure value from when `handleTurnComplete` was created — correct for `prevFamiliarity`. Do NOT add `relationships` to the `useCallback` dep array. DO add `checkDarkReveal` to the `useCallback` dep array (line 243) so `handleTurnComplete` uses the latest `checkDarkReveal` (which closes over the current `characters` list for name lookup).

### Steps

- [ ] **Step 1: Add `checkDarkReveal` helper inside `WorldPage`**

  Insert after the `mountedRef` block (after line 49 — `useEffect(() => () => { mountedRef.current = false; }, []);`):

  ```js
  const checkDarkReveal = useCallback(async (crossedCharIds) => {
    if (crossedCharIds.length === 0) return;
    try {
      const freshRels = await relationshipsApi.get(worldId);
      if (!mountedRef.current) return;
      setRelationships(freshRels.relationships || {});
      for (const charId of crossedCharIds) {
        const charName = characters.find(c => c.id === charId)?.name || charId;
        useChatStore.getState().addSystemMessage(`你与${charName}之间的关系出现了某种裂变……`);
      }
    } catch (err) {
      console.warn('[WorldPage] dark reveal re-fetch failed:', err.message);
    }
  }, [worldId, characters, setRelationships]);
  ```

  `useCallback` is already imported at line 1 — no new import needed. `mountedRef` is a ref and is stable; omit it from the dep array.

- [ ] **Step 2: Extend `handleEventAccepted` event-drift `.then()` callback**

  Locate the event-drift `.then()` block (around lines 167–177). Replace the existing callback body with the extended version from Sub-step B above. The `setRelationships` call is unchanged; add the `crossed` detection + `checkDarkReveal` call after it.

- [ ] **Step 3: Extend `handleTurnComplete` evaluate `.then()` callback**

  Locate the evaluate `.then()` block (around lines 230–240). Replace the existing callback body with the extended version from Sub-step C above. The `setRelationships` call is unchanged; add the threshold check + `checkDarkReveal` call after it.

  Also update the `useCallback` dependency array at line 243: add `checkDarkReveal` to it. `relationships` must remain absent. The updated dep array:

  ```js
  }, [worldId, selectedCharacterId, incrementTurns, setProposing, setPendingProposal, apiConfig, checkDarkReveal]);
  ```

  This ensures `handleTurnComplete` always calls the latest `checkDarkReveal`, which in turn closes over the current `characters` list for name resolution.

- [ ] **Step 4: Run build to verify**

  ```bash
  cd frontend && npm run build
  ```

  Expected: build completes with no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/WorldPage.jsx
  git commit -m "feat: dark-side reveal unlock — re-fetch and notify on familiarity >= 90"
  ```

---

## Task 4: Full build verification

- [ ] **Step 1: Run the full production build from repo root**

  ```bash
  npm run build
  ```

  Expected: exits 0 with no errors.

- [ ] **Step 2: Run backend tests**

  ```bash
  cd tests && npm test
  ```

  Expected: all tests pass.
