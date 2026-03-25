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
3. For each newly-revealed character: injects a narrative message into chat via `useChatStore`

The re-fetch is a single call even when multiple characters unlock simultaneously. It replaces the entire `relationships` state with the authoritative server response.

## Components

### Threshold Detection

In `WorldPage.jsx`, both `evaluate` and `event-drift` `.then()` callbacks:

```js
const darkUnlocked = relationships[charId]?.familiarity < 90 && newFamiliarity >= 90;
```

`relationships` is available from the outer component closure. The check is purely local — no new state needed.

### Re-fetch on Unlock

```js
const freshRels = await relationshipsApi.get(worldId);
if (mountedRef.current) setRelationships(freshRels.relationships || {});
```

Called once per unlock event (not per character), even if multiple characters cross the threshold simultaneously.

### Narrative Notification

Injected as a system-style chat entry for each newly-revealed character:

```
你与[名字]之间的关系出现了某种裂变……
```

Uses the character's `name` from `characters` state. Fixed template — no LLM call.

Injection mechanism: `useChatStore.getState().addSystemMessage(text)` or equivalent method that appends a non-character message to the active chat.

## Data Flow

```
evaluate/event-drift resolves
  → check: any charId crossed < 90 → >= 90?
  → if yes:
      collect newly-revealed charIds
      call relationshipsApi.get(worldId) once
      setRelationships(freshRels.relationships)
      for each newly-revealed charId:
        find character name from `characters` state
        inject narrative message into chat
```

## Affected Files

- **Modify:** `frontend/src/pages/WorldPage.jsx`
  - Add threshold detection in `evaluate` `.then()` callback (`handleTurnComplete`)
  - Add threshold detection in `event-drift` `.then()` callback (`handleEventAccepted`)
  - Add re-fetch helper (shared logic for both call sites)
  - Add narrative message injection

- **Read for context:** `frontend/src/stores/chatStore.js` — understand how to append a system message

## Error Handling

- Re-fetch failure: catch and warn, do not block. The optimistic familiarity update is already committed to state.
- Character name not found: fall back to charId in the notification text.
- `mountedRef.current` guard on all async callbacks (existing pattern).

## Not In Scope

- LLM-generated notification text
- Backend changes
- Retroactive unlock detection on page load (already handled by initial `GET /relationships` fetch)
- Animation or toast UI for the notification
