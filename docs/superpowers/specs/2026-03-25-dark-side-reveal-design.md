# Dark-Side Reveal Unlock Design

## Goal

When a character's familiarity crosses the 90 threshold (via chat evaluation or event-drift), automatically re-fetch relationships from the server to get `dark_revealed: true` + dark traits, and inject a narrative notification into the chat: "你与[名字]之间的关系出现了某种裂变……"

## Background

`GET /relationships/:worldId` already computes `dark_revealed: true` dynamically when `familiarity >= 90` and the character has `hidden_traits`. The problem: after an optimistic familiarity update, local state still shows `dark_revealed: false` until page reload. The archive "隐藏面" section and `CharacterProfilePanel` dark trait display don't activate until the server state is fetched fresh.

## Architecture

Frontend-only change. No backend modifications required.

After `evaluate` and `event-drift` resolve, the `.then()` callback:
1. Detects threshold crossing: `prevFamiliarity < 90 && newFamiliarity >= 90`
2. If any character crossed: calls `relationshipsApi.get(worldId)` once to replace full `relationships` state
3. For each newly-revealed character: injects a narrative system message into chat

The re-fetch is a single call even when multiple characters unlock simultaneously. It replaces the entire `relationships` state with the authoritative server response.

## Components

### Threshold Detection

**`prevFamiliarity`** comes from the `relationships` closure value captured when the enclosing function was created — which is the pre-call state. This is the correct value to use and no extra instrumentation is needed.

- In `handleEventAccepted` (a plain function, re-created each render): `relationships` in the closure is the value at the time `handleEventAccepted` was called. `prevFamiliarity = relationships[charId]?.familiarity ?? 0`.
- In `handleTurnComplete` (a `useCallback`): `relationships` is **not** in the dependency array and should remain absent. The stale closure value is exactly the pre-call `prevFamiliarity` we need. Do not add `relationships` to the `useCallback` dep array.

`newFamiliarity` comes from the API response (`updated[i].familiarity` for event-drift, `evalResult.familiarity` for evaluate) — not from state, which hasn't been updated yet at this point in the callback.

```js
// event-drift path
for (const { charId, familiarity: newFamiliarity } of updated) {
  const prevFamiliarity = relationships[charId]?.familiarity ?? 0;
  if (prevFamiliarity < 90 && newFamiliarity >= 90) { /* unlock */ }
}

// evaluate path
const prevFamiliarity = relationships[selectedCharacterId]?.familiarity ?? 0;
const newFamiliarity = evalResult.familiarity;
if (prevFamiliarity < 90 && newFamiliarity >= 90) { /* unlock */ }
```

### Re-fetch on Unlock

```js
const freshRels = await relationshipsApi.get(worldId);
if (mountedRef.current) setRelationships(freshRels.relationships || {});
```

Called once per unlock event (not per character), even if multiple characters cross the threshold simultaneously.

### System Message Injection

Add `addSystemMessage(text)` to `chatStore.js`:

```js
addSystemMessage(text) {
  const id = crypto.randomUUID();
  set((s) => ({
    blocks: [...s.blocks, { id, characterId: '__system__', characterName: null, messages: [{ role: 'assistant', content: text }] }],
  }));
},
```

Update `ChatBlock.jsx` to render system blocks without a character header or export button:

```jsx
if (block.characterId === '__system__') {
  return (
    <div className="px-4 py-2 text-center">
      <p className="text-xs text-ink/40 italic">{block.messages[0]?.content}</p>
    </div>
  );
}
```

This guard is placed at the top of the `ChatBlock` function before the normal render path.

Injection call in `WorldPage.jsx`:
```js
const charName = characters.find(c => c.id === charId)?.name || charId;
useChatStore.getState().addSystemMessage(`你与${charName}之间的关系出现了某种裂变……`);
```

## Data Flow

```
evaluate/event-drift resolves
  → for each updated charId:
      prevFamiliarity = relationships[charId]?.familiarity ?? 0  (closure value)
      newFamiliarity = API response value
      if prevFamiliarity < 90 && newFamiliarity >= 90:
        collect charId as newly revealed
  → if any newly revealed:
      call relationshipsApi.get(worldId) once
      setRelationships(freshRels.relationships)
      for each newly-revealed charId:
        find character name from `characters` state
        useChatStore.getState().addSystemMessage(...)
```

## Affected Files

- **Modify:** `frontend/src/stores/chatStore.js` — add `addSystemMessage(text)` method
- **Modify:** `frontend/src/components/chat/ChatBlock.jsx` — render system blocks (no header, centered italic)
- **Modify:** `frontend/src/pages/WorldPage.jsx`
  - Add threshold detection in `evaluate` `.then()` callback (`handleTurnComplete`)
  - Add threshold detection in `event-drift` `.then()` callback (`handleEventAccepted`)
  - Add re-fetch and narrative injection logic (shared across both call sites via helper or inline)

## Error Handling

- Re-fetch failure: catch and warn, do not block. The optimistic familiarity update is already committed to state.
- Character name not found: fall back to `charId` in the notification text.
- `mountedRef.current` guard on all async callbacks (existing pattern).

## Not In Scope

- LLM-generated notification text
- Backend changes
- Retroactive unlock detection on page load (already handled by initial `GET /relationships` fetch)
- Animation or toast UI for the notification
- `getAllMessages` in `chatStore.js` filtering out `__system__` blocks — system messages are intentionally excluded from LLM context already since they are appended after the `.then()`, not during a chat turn
