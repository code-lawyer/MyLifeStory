# NPC Depth System Design

Date: 2026-03-23

## Overview

A unified NPC depth system comprising four interconnected features: familiarity tracking, progressive dark-side reveals, world-background NPC generation, and enhanced character refinement. Familiarity is the core engine driving archive unlocks, dark-side progression, and dialogue style adaptation.

## 1. Familiarity System

### 1.1 Data Model

New storage file `relationships/{worldId}.json`:

```json
{
  "relationships": {
    "<charId>": {
      "familiarity": 35,
      "last_interaction": "2026-03-23T10:00:00Z"
    }
  }
}
```

- `familiarity`: integer 0–100
- Backend: new `storage/relationships.js` (read/write), new REST router `relationships.js`
- Endpoints:
  - `GET /api/world-sim/relationships/{worldId}` — returns all relationships + computed `dark_revealed` flags
  - `POST /api/world-sim/relationships/{worldId}/{charId}/evaluate` — per-turn familiarity evaluation
- No PUT endpoint exposed. Relationships are only modified through the evaluate endpoint and initialization logic. Direct writes are internal only.

### 1.2 Initialization

**Core NPCs** (created via CoreNpcStep): LLM evaluates initial familiarity at save time.
- Prompt input: protagonist bio + NPC name + relationship description
- Returns: `{ initial_familiarity: number }`
- Written to relationships file immediately after character save
- If this LLM call fails, default to `initial_familiarity: 20` and log a warning. Character save is not affected.

**Non-core NPCs** (bulk generated): initial familiarity fixed at 0. A relationship entry is created for each legendary/elite NPC immediately when the character is saved to storage — before any fire-and-forget dark-side LLM call. Normal/disposable NPCs get entries lazily on first interaction.

### 1.3 Per-Turn Evaluation

Endpoint: `POST /api/world-sim/relationships/{worldId}/{charId}/evaluate`

- Input: `{ messages: [...], currentFamiliarity: number }` — messages are the last 3 messages from the active character's chat block (not global messages)
- LLM returns: `{ delta: 1-5, reason: "..." }`
- Backend clamps result to 0–100, writes back, and returns `{ familiarity: newValue, delta, reason }` (the new absolute value)
- If no relationship entry exists yet, one is created with `familiarity: delta`.
- Called asynchronously from `handleTurnComplete` in WorldPage — does not block chat
- Frontend updates local relationships state using the returned absolute `familiarity` value (not by computing delta locally), ensuring consistency with server state

**Failure contract**: If the evaluate call fails (network error, LLM 502, etc.), the delta is silently dropped. Frontend logs a `console.warn` but does not show an error to the user. No retry — the next chat turn will trigger a new evaluation. This is acceptable because familiarity is a gradual accumulation; a single missed delta has negligible impact.

### 1.4 Context Builder Integration

The context builder (`context.js`) changes from a pure request-body processor to one that performs server-side I/O. The `POST /context/build` endpoint body gains two new optional fields:

```
activeCharacterId: string   // ID of the character currently being chatted with
worldId: string             // needed to read relationships + hidden_traits from storage
```

When both are provided, the context builder:
1. Reads `relationships/{worldId}.json` to get familiarity for the active character
2. Reads the active character's file from `characters/` storage to access `hidden_traits` (if any)
3. Appends familiarity and dark-side instructions to the system prompt

This means `context.js` gains imports for `storage/relationships.js` and `storage/characters.js`. The frontend passes `activeCharacterId` and `worldId` in the `buildContext` payload (already available in ChatPane props).

### 1.5 Dialogue Style Injection

System prompt appendix based on familiarity:

```
# Relationship with player
Familiarity level: {value}/100 ({label})
Adjust your tone accordingly — {instruction}
```

Familiarity bands:
| Range | Label | Instruction |
|-------|-------|-------------|
| 0–20 | 陌生 | Be formal and guarded. Reveal little personal information. |
| 21–40 | 相识 | Be polite but maintain distance. Occasionally share surface-level thoughts. |
| 41–60 | 熟悉 | Be friendly and open. Share opinions and personal anecdotes naturally. |
| 61–80 | 亲密 | Be casual and warm. Use informal language, show genuine concern. |
| 81–100 | 知己 | Be deeply candid. Share secrets, vulnerabilities, and unfiltered thoughts. |

## 2. Dark-Side System

### 2.1 Data Model

Character object gains optional `hidden_traits` field. This field is **backend-only** — it must be stripped from all API responses and exports:

```json
{
  "hidden_traits": {
    "dark_personality": "表面温和实则极度控制欲...",
    "dark_motivation": "因童年被忽视，渴望绝对的依赖感...",
    "phases": [
      { "threshold": 70, "hint": "偶尔对主角行踪异常关注" },
      { "threshold": 80, "hint": "试探性孤立主角与他人关系" },
      { "threshold": 90, "hint": "完全暴露控制本性，语气彻底转变" }
    ]
  }
}
```

Computed field in relationships GET response:
- `dark_revealed: boolean` — true when `familiarity >= 90 && character has hidden_traits`

### 2.2 hidden_traits Security

`hidden_traits` must never reach the frontend. Stripping points:
- **GET /characters** and **GET /characters/:charId**: strip `hidden_traits` before returning
- **PUT /characters/:charId**: strip `hidden_traits` from the request body to prevent clients from overwriting it; preserve the existing stored value
- **GET /:worldId/export** in `worlds.js`: strip `hidden_traits` from each character in the export bundle
- **POST /import** in `worlds.js`: if imported characters contain `hidden_traits`, strip it (dark-side is regenerated, not imported)

### 2.3 Generation

**Selection**: During bulk NPC generation (`bulk-npcs` endpoint), count legendary + elite NPCs in the batch. Randomly mark 20% for dark-side generation.

**Prompt**: Marked NPCs use an enhanced prompt requesting `hidden_traits` with constraints:
- Surface persona and hidden persona must contrast
- Three phases must show clear escalation
- Hints must be subtle enough to embed naturally in dialogue

**Core NPCs**: Same 20% rule. After CoreNpcStep saves a character, the backend character creation endpoint randomly decides whether to generate `hidden_traits` via a separate LLM call. This is fire-and-forget: if the LLM call fails, the character simply has no dark side. The character save is already complete and unaffected.

### 2.4 Progressive Reveal in Dialogue

Context builder checks `familiarity` against `hidden_traits.phases` (read from character storage, see section 1.4):

| Familiarity | Injection |
|-------------|-----------|
| < 70 | Nothing. NPC behaves per surface personality only. |
| 70–79 | Phase 1 hint injected as hidden instruction: "Subtly [hint] without being obvious" |
| 80–89 | Phase 2 hint injected |
| ≥ 90 | Phase 3 hint + full `dark_personality` + `dark_motivation` injected. Persona fully switches. |

### 2.5 Frontend Visibility

- Frontend never receives `hidden_traits` content directly
- All dark-side behavior is controlled server-side via system prompt injection
- Only signal to frontend: `dark_revealed` flag in relationships API response
- Archive page shows "隐藏面" section only when `dark_revealed === true`. The backend populates `dark_personality` and `dark_motivation` into the relationships response ONLY when `dark_revealed` is true, as a one-time reveal payload.

Relationships GET response shape when `dark_revealed` is true:
```json
{
  "relationships": {
    "<charId>": {
      "familiarity": 93,
      "last_interaction": "2026-03-23T10:00:00Z",
      "dark_revealed": true,
      "dark_personality": "表面温和实则极度控制欲...",
      "dark_motivation": "因童年被忽视，渴望绝对的依赖感..."
    }
  }
}
```
When `dark_revealed` is false, `dark_personality` and `dark_motivation` fields are omitted entirely.

## 3. Core NPC 50% World-Background Generation

### 3.1 New Endpoint

`POST /api/world-sim/generate/world-npcs`:
- Input: `{ worldContext, protagonistBio, count, apiConfig }`
- Prompt: Generate `count` important NPCs that fit the world but are NOT mentioned in protagonist bio. Use protagonist bio only as context for what roles are already filled.
- Returns: `{ world_npcs: [{ name, relationship, suggested_tier }] }`

Note: No `existingNames` parameter needed. The prompt instructs the LLM to generate characters not mentioned in the protagonist bio, which serves the same deduplication purpose without requiring the protagonist endpoint result.

### 3.2 Execution Order

ProtagonistBioStep calls endpoints **sequentially**, not in parallel:
1. `generateApi.protagonist(bio, worldContext, apiConfig)` → returns `{ core_npcs }` with N entries
2. `generateApi.worldNpcs(worldContext, bio, N, apiConfig)` → returns `{ world_npcs }` with at least N entries

This ensures the world-npcs count matches the protagonist-npcs count (≥ 50% world-background). Both lists passed to CoreNpcStep.

### 3.3 Frontend Flow (CoreNpcStep)

Two-group display:

1. **"小传中的核心人物"** — NPCs from protagonist analysis (existing flow)
2. **"世界中的重要人物"** — NPCs from world-npcs endpoint (new)

Both groups share the same draft generation / refine / save workflow. All saved with `is_core: true`.

**Prop interface change**: CoreNpcStep replaces the old `suggestions` prop with two new props:
- `protagonistNpcs: NpcSuggestion[]` — NPCs extracted from protagonist bio
- `worldNpcs: NpcSuggestion[]` — NPCs generated from world background

Where `NpcSuggestion` is `{ name: string, relationship: string, suggested_tier: "legendary" | "elite" }`.

**Zero-result handling**: If world-npcs returns an empty list, the second group section is hidden and a small notice is shown: "AI未能生成额外人物，可稍后在角色创建页手动添加". The protagonist group proceeds normally.

### 3.4 Setup Page Integration

ProtagonistBioStep manages both calls sequentially. Loading state shows "正在分析主角小传…" then "正在生成世界人物…". `onComplete` callback signature changes from `(coreNpcs: NpcSuggestion[])` to `(result: { protagonistNpcs: NpcSuggestion[], worldNpcs: NpcSuggestion[] })`.

SetupPage destructures the result and passes both arrays as separate props to CoreNpcStep:
```jsx
<CoreNpcStep protagonistNpcs={result.protagonistNpcs} worldNpcs={result.worldNpcs} ... />
```

## 4. Enhanced Refine Dialog

### 4.1 Pre-generated Suggestions

Character generation prompt (`/generate/character`) extended to also return:

```json
{
  "draft": { ... },
  "refine_suggestions": {
    "identity": ["增加更多外貌细节", "补充与其他角色的关系网"],
    "voice": ["增加方言或口头禅特征", "调整语气使其更符合年龄"],
    "current_state": ["明确当前面临的困境"]
  }
}
```

### 4.2 Suggestions Storage

`useDraftWizard` hook gains:
- `refineSuggestions` state slot (object keyed by section name, e.g. `{ identity: [...], voice: [...] }`)
- `setRefineSuggestions` setter, populated when `handleGenerate` receives the response
- `handleRefreshSuggestions(section)` async function: calls the `suggest-refine` endpoint with the current draft and section, then updates the corresponding entry in `refineSuggestions`. This is the only function RefineDialog needs for the refresh button.

`RefineDialog` receives two new props:
- `suggestions: string[]` — current suggestions for the section being refined
- `onRefreshSuggestions: () => Promise<void>` — triggers the refresh. Callers close over the section when passing this prop: `onRefreshSuggestions={() => handleRefreshSuggestions(currentSection)}`

For `CoreNpcStep` (which does not use `useDraftWizard`): suggestions are stored in local component state alongside the draft, following the same shape. A local `handleRefreshSuggestions` function calls `generateApi.suggestRefine(draft, section, apiConfig)` and updates local state. The refine flow is wired up by calling the existing `generateApi.refineCharacter` function directly (same as CreateCharacterPage's `refineFn`), not by adopting `useDraftWizard` wholesale.

### 4.3 Refresh Endpoint

`POST /api/world-sim/generate/character/suggest-refine`:
- Input: `{ draft, section, apiConfig }`
- Prompt: Analyze this section and suggest 3–4 specific improvement directions
- Returns: `{ suggestions: ["...", "...", "..."] }`

### 4.4 RefineDialog UI Changes

- **Top section**: AI suggestion chips (clickable, clicking fills instruction input)
- **Refresh button**: Top-right, calls suggest-refine endpoint to replace suggestions. Shows spinner during fetch.
- **Bottom section**: Free-text instruction input (existing, unchanged)
- User can: click a suggestion, type custom instruction, or combine both

## 5. Archive Page Changes

### 5.1 Data Loading

`WorldArchivePage` adds `relationshipsApi.get(worldId)` to its own `Promise.all` fetch (independent from WorldPage). Relationship data stored in local state.

### 5.2 Character Display States

| Condition | Display |
|-----------|---------|
| familiarity < 50 | Name + tier marker + familiarity bar. Description: "了解不足，无法查看详情" |
| familiarity ≥ 50 | Full profile: description, personality, background, voice style, relationship |
| dark_revealed === true | Additional "隐藏面" section with dark_personality and dark_motivation (provided by relationships API) |

### 5.3 Familiarity Progress Bar

Thin, muted progress bar beneath each character name. Consistent with the parchment aesthetic — no bright colors, use `ink/20` for track and `ink/50` for fill.

### 5.4 Sidebar Integration (WorldPage)

CharacterSelector shows a small familiarity indicator next to each NPC name (number or subtle arc). Lightweight — not a full progress bar.

## 6. Data Flow Summary

### Chat Turn Completion

```
User sends message → ChatPane streams response → handleTurnComplete fires →
  1. Event proposal check (existing)
  2. Familiarity evaluation (new, async, fire-and-forget):
     POST /relationships/{worldId}/{charId}/evaluate
     body: { messages: [last 3 from active character's block], currentFamiliarity }
     → LLM returns delta → backend updates file
     → Frontend updates local relationships state
     On failure: console.warn, no retry, no user-visible error
```

### World Page Load

```
Promise.all([
  worldsApi.get(worldId),
  playerApi.get(worldId),
  scenesApi.list(worldId),
  charactersApi.listByWorld(worldId),
  relationshipsApi.get(worldId)          // NEW
]) → populate state
```

### Archive Page Load

```
Promise.all([
  eventsApi.list(worldId),               // existing
  charactersApi.listByWorld(worldId),     // existing
  scenesApi.list(worldId),               // existing
  relationshipsApi.get(worldId)          // NEW
]) → populate state, gate character display by familiarity
```

### Context Building (per chat message)

```
POST /context/build body now includes: worldId, activeCharacterId

context.js:
  1. Process request body data as before (world card, scene, player, events, characters, chat)
  2. Read relationships/{worldId}.json → get familiarity for activeCharacterId
  3. Read character file for activeCharacterId → get hidden_traits (if any)
  4. Append familiarity band instruction to system prompt
  5. If hidden_traits exists, check familiarity against phase thresholds → inject dark-side hints
  6. Return systemPrompt + trimmedChatHistory
```

## 7. Files to Create or Modify

### New Files
- `src/endpoints/world-simulation/storage/relationships.js` — read/write relationships JSON
- `src/endpoints/world-simulation/relationships.js` — REST router (GET, evaluate)
- `frontend/src/api/relationships.js` — API client

### Modified Files (Backend)
- `src/endpoints/world-simulation/generate.js` — world-npcs endpoint, dark-side generation in bulk-npcs, suggest-refine endpoint, refine_suggestions in character generation prompt
- `src/endpoints/world-simulation/context.js` — gains file I/O imports; reads relationships + hidden_traits; injects familiarity and dark-side instructions
- `src/endpoints/world-simulation/characters.js` — strip `hidden_traits` from GET responses; preserve `hidden_traits` on PUT (strip from body, merge with stored value)
- `src/endpoints/world-simulation/worlds.js` — mount relationships router; strip `hidden_traits` from export; strip from import

### Modified Files (Frontend)
- `frontend/src/components/setup/CoreNpcStep.jsx` — two-group display, wire up refine with local state + suggestions
- `frontend/src/components/setup/ProtagonistBioStep.jsx` — sequential world-npcs call after protagonist call
- `frontend/src/components/setup/BulkGenerateStep.jsx` — dark-side flag in generation (backend handles selection, no frontend change needed beyond displaying results)
- `frontend/src/components/wizard/RefineDialog.jsx` — suggestion chips, refresh button, suggestions prop
- `frontend/src/hooks/useDraftWizard.js` — add `refineSuggestions` state slot and setter
- `frontend/src/pages/WorldPage.jsx` — load relationships, pass to children, evaluate on turn complete
- `frontend/src/pages/WorldArchivePage.jsx` — load relationships, familiarity-gated display, dark_revealed section
- `frontend/src/components/world/CharacterSelector.jsx` — familiarity indicator
- `frontend/src/components/chat/ChatPane.jsx` — pass worldId + activeCharacterId to buildContext
- `frontend/src/api/chat.js` — add worldId + activeCharacterId to buildContext payload
- `frontend/src/api/generate.js` — worldNpcs, suggestRefine methods
