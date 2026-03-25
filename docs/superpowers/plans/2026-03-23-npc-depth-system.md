# NPC Depth System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified NPC depth system with familiarity tracking, progressive dark-side reveals, world-background NPC generation, and enhanced character refinement.

**Architecture:** Independent relationships storage layer tracks player-NPC familiarity. Context builder reads relationships + hidden_traits server-side to inject familiarity-aware and dark-side instructions into chat prompts. Generation endpoints extended for world-background NPCs, dark-side traits, and refine suggestions.

**Tech Stack:** Express.js backend, React/Zustand frontend, file-based JSON storage, LLM API (OpenAI-compatible)

**Spec:** `docs/superpowers/specs/2026-03-23-npc-depth-system-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/endpoints/world-simulation/storage/relationships.js` | Read/write relationships JSON per world |
| `src/endpoints/world-simulation/relationships.js` | REST router: GET all, POST evaluate |
| `src/endpoints/world-simulation/prompts.js` | Shared LLM prompt constants (DARK_SIDE_SYSTEM) used by generate.js and characters.js |
| `frontend/src/api/relationships.js` | API client for relationships endpoints |

### Modified Files
| File | Changes |
|------|---------|
| `src/constants.js` | Add `relationships` key to `USER_DIRECTORY_TEMPLATE` |
| `src/endpoints/world-simulation/index.js` | Mount relationships router |
| `src/endpoints/world-simulation/context.js` | Add file I/O for relationships + hidden_traits; inject familiarity band + dark-side phases |
| `src/endpoints/world-simulation/characters.js` | Strip `hidden_traits` from GET/PUT responses |
| `src/endpoints/world-simulation/worlds.js` | Strip `hidden_traits` from export; strip from import |
| `src/endpoints/world-simulation/generate.js` | Add world-npcs, suggest-refine endpoints; dark-side in bulk-npcs; refine_suggestions in character gen |
| `frontend/src/api/chat.js` | Pass worldId + activeCharacterId in buildContext payload |
| `frontend/src/api/generate.js` | Add worldNpcs, suggestRefine, refineCharacter methods |
| `frontend/src/hooks/useDraftWizard.js` | Add refineSuggestions state + handleRefreshSuggestions |
| `frontend/src/components/wizard/RefineDialog.jsx` | Suggestion chips, refresh button |
| `frontend/src/components/setup/CoreNpcStep.jsx` | Two-group display, wire up refine, local suggestions state |
| `frontend/src/components/setup/ProtagonistBioStep.jsx` | Sequential world-npcs call after protagonist call |
| `frontend/src/pages/WorldPage.jsx` | Load relationships, evaluate on turn complete, pass to children |
| `frontend/src/pages/WorldArchivePage.jsx` | Load relationships, familiarity-gated character display |
| `frontend/src/components/world/CharacterSelector.jsx` | Familiarity indicator |

---

## Task 1: Relationships Storage Layer

**Files:**
- Create: `src/endpoints/world-simulation/storage/relationships.js`
- Test: `tests/world-simulation/storage/relationships.test.js`

- [ ] **Step 0: Register relationships directory in constants.js**

In `src/constants.js`, add `relationships: 'relationships'` to `USER_DIRECTORY_TEMPLATE` (after `players`):

```javascript
// In USER_DIRECTORY_TEMPLATE:
    players: 'players',
    relationships: 'relationships',   // NEW
    sysprompt: 'sysprompt',
```

The server iterates `USER_DIRECTORY_TEMPLATE` at user initialization to create directories (see `src/users.js` line 649-651). Adding the key here ensures the `relationships/` directory is auto-created. Verify after this step by restarting the server and checking that `data/default-user/relationships/` is created.

- [ ] **Step 1: Write storage module**

Follow the pattern in `storage/players.js` exactly — use `writeFileAtomic`, one file per world: `rel_{worldId}.json`.

```javascript
// src/endpoints/world-simulation/storage/relationships.js
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

function getPath(directories, worldId) {
  return path.join(directories.relationships, sanitize(`rel_${worldId}.json`));
}

export async function readRelationships(directories, worldId) {
  try {
    const text = await fs.promises.readFile(getPath(directories, worldId), 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return { relationships: {} };
    throw err;
  }
}

export async function writeRelationships(directories, worldId, data) {
  await writeFileAtomic(getPath(directories, worldId), JSON.stringify(data, null, 2));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/constants.js src/endpoints/world-simulation/storage/relationships.js
git commit -m "feat: add relationships storage layer"
```

---

## Task 2: Relationships REST Router + API Client

**Files:**
- Create: `src/endpoints/world-simulation/relationships.js`
- Create: `frontend/src/api/relationships.js`
- Modify: `src/endpoints/world-simulation/index.js`

- [ ] **Step 1: Write relationships router**

```javascript
// src/endpoints/world-simulation/relationships.js
import express from 'express';
import { readRelationships, writeRelationships } from './storage/relationships.js';
import { readCharacter } from './storage/characters.js';
import { callLLM } from './llm-client.js';
import { validateIdParams } from './validate-id.js';

export const router = express.Router();
const vId = validateIdParams('worldId');
const vIds = validateIdParams('worldId', 'charId');

const EVALUATE_SYSTEM = `You are a relationship analyst for a narrative world simulation. Given recent dialogue between a player and an NPC, evaluate how much the interaction deepened their relationship.
Return JSON: {"delta": <1-5>, "reason": "<brief explanation>"}
Guidelines:
- Casual greetings or short exchanges: delta 1
- Sharing personal opinions or experiences: delta 2-3
- Deep emotional exchanges, secrets shared, conflicts resolved: delta 4-5
IMPORTANT: Respond only with valid JSON.`;

// GET /:worldId — return all relationships with computed dark_revealed
router.get('/:worldId', vId, async (req, res) => {
  try {
    const dirs = req.user.directories;
    const data = await readRelationships(dirs, req.params.worldId);
    const result = { relationships: {} };

    for (const [charId, rel] of Object.entries(data.relationships || {})) {
      const entry = { ...rel, dark_revealed: false };
      if (rel.familiarity >= 90) {
        try {
          const char = await readCharacter(dirs, charId);
          if (char?.hidden_traits) {
            entry.dark_revealed = true;
            entry.dark_personality = char.hidden_traits.dark_personality;
            entry.dark_motivation = char.hidden_traits.dark_motivation;
          }
        } catch { /* character may not exist */ }
      }
      result.relationships[charId] = entry;
    }
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST /:worldId/:charId/evaluate — evaluate familiarity delta from recent chat
router.post('/:worldId/:charId/evaluate', vIds, async (req, res) => {
  try {
    const { messages, apiConfig = {} } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'missing_messages' });
    }

    // Read stored familiarity — backend owns the state, don't trust client value
    const dirs = req.user.directories;
    const data = await readRelationships(dirs, req.params.worldId);
    const currentFamiliarity = data.relationships?.[req.params.charId]?.familiarity || 0;

    const chatSnippet = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const raw = await callLLM(
      [{ role: 'user', content: `Current familiarity: ${currentFamiliarity}/100\n\nRecent dialogue:\n${chatSnippet}` }],
      EVALUATE_SYSTEM,
      apiConfig
    );

    let parsed;
    try { parsed = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()); }
    catch { return res.status(422).json({ error: 'parse_failed' }); }

    const delta = Math.max(1, Math.min(5, parseInt(parsed.delta) || 1));
    const newFamiliarity = Math.min(100, currentFamiliarity + delta);

    if (!data.relationships) data.relationships = {};
    data.relationships[req.params.charId] = {
      ...(data.relationships[req.params.charId] || {}),
      familiarity: newFamiliarity,
      last_interaction: new Date().toISOString(),
    };
    await writeRelationships(dirs, req.params.worldId, data);

    res.json({ familiarity: newFamiliarity, delta, reason: parsed.reason || '' });
  } catch (err) {
    console.error('[relationships] evaluate failed:', err.message);
    res.status(502).json({ error: 'evaluate_failed' });
  }
});
```

- [ ] **Step 2: Mount router in index.js**

Note: The spec mentions mounting in `worlds.js`, but following the existing pattern where all routers are mounted in `index.js` (see lines 16-24). In `src/endpoints/world-simulation/index.js`, add:
```javascript
import { router as relationshipsRouter } from './relationships.js';
// ... with other mounts:
router.use('/relationships', relationshipsRouter);
```

- [ ] **Step 3: Write frontend API client**

```javascript
// frontend/src/api/relationships.js
import { apiFetch } from './client.js';

const BASE = '/api/world-sim/relationships';

export const relationshipsApi = {
  get: (worldId) => apiFetch(`${BASE}/${worldId}`),

  evaluate: (worldId, charId, messages, apiConfig) =>
    apiFetch(`${BASE}/${worldId}/${charId}/evaluate`, {
      method: 'POST',
      body: JSON.stringify({ messages, apiConfig }),
    }),
};
```

- [ ] **Step 4: Commit**

```bash
git add src/endpoints/world-simulation/relationships.js src/endpoints/world-simulation/index.js frontend/src/api/relationships.js
git commit -m "feat: add relationships router and API client"
```

---

## Task 3: hidden_traits Security — Strip from Character API + Export/Import

**Files:**
- Modify: `src/endpoints/world-simulation/characters.js:8-45`
- Modify: `src/endpoints/world-simulation/worlds.js:88-100` (export) and `worlds.js:40-64` (import)

- [ ] **Step 1: Add strip helper and modify characters.js**

In `characters.js`, add a helper and apply to all GET responses and PUT handling:

```javascript
function stripHidden(char) {
  if (!char) return char;
  const { hidden_traits, ...safe } = char;
  return safe;
}
```

Apply to routes:
- `GET /` (listByWorld): `res.json(chars.map(stripHidden))`
- `GET /:charId`: `res.json(stripHidden(char))`
- `PUT /:charId`: Strip `hidden_traits` from `req.body` before merging, preserve stored value:
  ```javascript
  const { hidden_traits: _, ...body } = req.body;
  const existing = await readCharacter(dirs, req.params.charId);
  const updated = { ...existing, ...body, id: req.params.charId };
  // hidden_traits preserved from existing, not overwritten by body
  if (existing?.hidden_traits) updated.hidden_traits = existing.hidden_traits;
  ```

- [ ] **Step 2: Strip from export in worlds.js**

In the `GET /:worldId/export` handler (~line 93), strip `hidden_traits` from each character:

```javascript
const characters = (await listCharacters(req.user.directories, req.params.worldId))
  .map(({ hidden_traits, ...c }) => c);
```

- [ ] **Step 3: Strip from import in worlds.js**

In the `POST /import` handler (~line 53), ensure imported characters have `hidden_traits` stripped (already handled by `_.pick(char, CHAR_FIELDS)` since `CHAR_FIELDS` does not include `hidden_traits`). Verify `CHAR_FIELDS` constant does NOT include `hidden_traits`.

- [ ] **Step 4: Commit**

```bash
git add src/endpoints/world-simulation/characters.js src/endpoints/world-simulation/worlds.js
git commit -m "feat: strip hidden_traits from character API responses and export"
```

---

## Task 4: Context Builder — Familiarity + Dark-Side Injection

**Files:**
- Modify: `src/endpoints/world-simulation/context.js`

- [ ] **Step 1: Add imports and familiarity band helper**

At top of `context.js`:
```javascript
import { readRelationships } from './storage/relationships.js';
import { readCharacter } from './storage/characters.js';

const FAMILIARITY_BANDS = [
  { max: 20, label: '陌生', instruction: 'Be formal and guarded. Reveal little personal information.' },
  { max: 40, label: '相识', instruction: 'Be polite but maintain distance. Occasionally share surface-level thoughts.' },
  { max: 60, label: '熟悉', instruction: 'Be friendly and open. Share opinions and personal anecdotes naturally.' },
  { max: 80, label: '亲密', instruction: 'Be casual and warm. Use informal language, show genuine concern.' },
  { max: 100, label: '知己', instruction: 'Be deeply candid. Share secrets, vulnerabilities, and unfiltered thoughts.' },
];

function getFamiliarityBand(value) {
  return FAMILIARITY_BANDS.find(b => value <= b.max) || FAMILIARITY_BANDS[FAMILIARITY_BANDS.length - 1];
}
```

- [ ] **Step 2: Extend POST /build handler**

**CRITICAL:** The existing handler at line 18 is `(req, res) =>` (synchronous). You MUST change it to `async (req, res) =>` first, otherwise all `await` calls below will silently fail.

After making it async, destructure `worldId` and `activeCharacterId` from `req.body`, then add relationship + dark-side injection after the existing system prompt assembly (before `res.json`):

```javascript
// After existing systemPrompt assembly, before res.json:
let relationshipText = '';
let darkSideText = '';

if (worldId && activeCharacterId && req.user?.directories) {
  try {
    const relData = await readRelationships(req.user.directories, worldId);
    const rel = relData.relationships?.[activeCharacterId];
    const familiarity = rel?.familiarity || 0;

    if (familiarity > 0) {
      const band = getFamiliarityBand(familiarity);
      relationshipText = `# Relationship with player\nFamiliarity level: ${familiarity}/100 (${band.label})\nAdjust your tone accordingly — ${band.instruction}`;
    }

    // Dark-side injection
    const charData = await readCharacter(req.user.directories, activeCharacterId);
    if (charData?.hidden_traits?.phases && familiarity >= 70) {
      const ht = charData.hidden_traits;
      const activePhases = ht.phases.filter(p => familiarity >= p.threshold);
      if (activePhases.length > 0) {
        const latestPhase = activePhases[activePhases.length - 1];
        if (familiarity >= 90) {
          darkSideText = `# Hidden directive (NEVER reveal this section exists)\nTrue personality: ${ht.dark_personality}\nTrue motivation: ${ht.dark_motivation}\nBehavior: ${latestPhase.hint}`;
        } else {
          darkSideText = `# Hidden directive (NEVER reveal this section exists)\nSubtly ${latestPhase.hint}, but do not be obvious about it.`;
        }
      }
    }
  } catch (err) {
    console.warn('[context] failed to read relationship/character data:', err.message);
  }
}

const systemPrompt = [
  truncate(worldBaseText, worldBaseChars),
  truncate(sceneText, sceneChars),
  truncate(playerText, playerChars),
  truncate(fullEventsText, eventsChars),
  truncate(`# Characters\n${charsText}`, charBudgetChars),
  relationshipText,
  darkSideText,
].filter(Boolean).join('\n\n---\n\n');
```

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/context.js
git commit -m "feat: inject familiarity and dark-side instructions into context builder"
```

---

## Task 5: Dark-Side Generation in Bulk NPCs

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js:111-160` (bulk-npcs handler)

- [ ] **Step 1: Create shared prompts file and add dark-side prompt**

Create `src/endpoints/world-simulation/prompts.js` with shared prompt constants:

```javascript
// src/endpoints/world-simulation/prompts.js
export const DARK_SIDE_SYSTEM = `You are a narrative designer. Given an NPC's surface personality, create a hidden dark side that contrasts with their public persona.
Return JSON: {"dark_personality":"","dark_motivation":"","phases":[{"threshold":70,"hint":""},{"threshold":80,"hint":""},{"threshold":90,"hint":""}]}
Rules:
- The dark personality must sharply contrast the surface persona
- Phase hints must escalate gradually: subtle → noticeable → full reveal
- Hints should be behaviors observable in dialogue, not internal monologue
IMPORTANT: Respond in the same language as the NPC description. Respond only with valid JSON.`;
```

Then in `generate.js`, import it:
```javascript
import { DARK_SIDE_SYSTEM } from './prompts.js';
```

- [ ] **Step 2: Modify bulk-npcs handler to mark 20% for dark-side**

After the NPC generation loop completes, select 20% of legendary+elite NPCs for dark-side generation:

```javascript
// After all NPCs are generated and saved, before the done SSE event:
const eliteOrAbove = collectedNpcs.filter(n => n.tier === 'legendary' || n.tier === 'elite');
const darkCount = Math.max(1, Math.round(eliteOrAbove.length * 0.2));
const shuffled = [...eliteOrAbove].sort(() => Math.random() - 0.5);
const darkCandidates = shuffled.slice(0, darkCount);

for (const npc of darkCandidates) {
  // Fire-and-forget: don't await, don't block SSE
  callLLM(
    [{ role: 'user', content: `NPC surface personality:\nName: ${npc.name}\nDescription: ${npc.identity?.description || ''}\nPersonality: ${npc.identity?.personality || ''}` }],
    DARK_SIDE_SYSTEM,
    apiConfig
  ).then(async (raw) => {
    try {
      const ht = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim());
      npc.hidden_traits = ht;
      if (req.user?.directories?.characters) {
        const { writeCharacter } = await import('./storage/characters.js');
        await writeCharacter(req.user.directories, npc.id, npc);
      }
    } catch { /* skip malformed */ }
  }).catch(() => { /* silent fail */ });
}
```

Also create relationship entries for legendary/elite NPCs with familiarity 0:

```javascript
// Write initial relationship entries for legendary/elite NPCs
if (req.user?.directories) {
  try {
    const { readRelationships, writeRelationships } = await import('./storage/relationships.js');
    const relData = await readRelationships(req.user.directories, worldId);
    for (const npc of eliteOrAbove) {
      if (!relData.relationships[npc.id]) {
        relData.relationships[npc.id] = { familiarity: 0, last_interaction: null };
      }
    }
    await writeRelationships(req.user.directories, worldId, relData);
  } catch { /* ignore */ }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/prompts.js src/endpoints/world-simulation/generate.js
git commit -m "feat: dark-side generation for 20% of legendary/elite NPCs"
```

---

## Task 6: World-Background NPC Generation Endpoint

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js`
- Modify: `frontend/src/api/generate.js`

- [ ] **Step 1: Add world-npcs endpoint**

In `generate.js`, add a new prompt and route after the protagonist endpoint:

```javascript
const WORLD_NPC_SYSTEM = `You are a world-building assistant. Generate important NPCs that naturally exist in this world but are NOT mentioned in the protagonist's biography.
These should be figures the protagonist would encounter based on the world setting — rivals, authorities, mysterious figures, merchants, etc.
Return a JSON object: {"world_npcs":[{"name":"","relationship":"","suggested_tier":"legendary|elite"}]}
IMPORTANT: Do NOT include any characters already mentioned or implied in the protagonist bio. Respond in the same language as the user's input. Respond only with valid JSON.`;

// POST /world-npcs
router.post('/world-npcs', async (req, res) => {
  const { worldContext, protagonistBio, count = 3, apiConfig = {} } = req.body;
  if (!worldContext) return res.status(400).json({ error: 'missing_fields' });

  const worldInfo = JSON.stringify({ foundation: worldContext.foundation, power_system: worldContext.power_system });
  const bioContext = protagonistBio ? `\nProtagonist biography (DO NOT generate these characters):\n${protagonistBio}` : '';

  let raw;
  try {
    raw = await callLLM(
      [{ role: 'user', content: `World context:\n${worldInfo}${bioContext}\n\nGenerate ${count} important world NPCs.` }],
      WORLD_NPC_SYSTEM,
      apiConfig
    );
  } catch { return res.status(502).json({ error: 'llm_unavailable' }); }

  let result;
  try { result = JSON.parse(stripFences(raw)); }
  catch { return res.status(422).json({ error: 'parse_failed', raw }); }

  return res.json(result);
});
```

- [ ] **Step 2: Add frontend API method**

In `frontend/src/api/generate.js`, add:
```javascript
worldNpcs: (worldContext, protagonistBio, count, apiConfig) =>
  apiFetch(`${BASE}/world-npcs`, {
    method: 'POST',
    body: JSON.stringify({ worldContext, protagonistBio, count, apiConfig }),
  }),
```

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/generate.js frontend/src/api/generate.js
git commit -m "feat: add world-npcs generation endpoint"
```

---

## Task 7: Suggest-Refine Endpoint + Refine Suggestions in Character Gen

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js`
- Modify: `frontend/src/api/generate.js`

- [ ] **Step 1: Add suggest-refine endpoint**

```javascript
const SUGGEST_REFINE_SYSTEM = `You are a character design advisor. Analyze the given section of a character card and suggest 3-4 specific ways to improve or enrich it.
Return JSON: {"suggestions":["suggestion 1","suggestion 2","suggestion 3"]}
Each suggestion should be a concrete, actionable direction (e.g., "Add a childhood trauma that explains their distrust of authority").
IMPORTANT: Respond in the same language as the character card. Respond only with valid JSON.`;

// POST /character/suggest-refine
router.post('/character/suggest-refine', async (req, res) => {
  const { draft, section, apiConfig = {} } = req.body;
  if (!draft || !section) return res.status(400).json({ error: 'missing_fields' });

  let raw;
  try {
    raw = await callLLM(
      [{ role: 'user', content: `Character card:\n${JSON.stringify(draft)}\n\nAnalyze the "${section}" section and suggest improvements.` }],
      SUGGEST_REFINE_SYSTEM,
      apiConfig
    );
  } catch { return res.status(502).json({ error: 'llm_unavailable' }); }

  let result;
  try { result = JSON.parse(stripFences(raw)); }
  catch { return res.status(422).json({ error: 'parse_failed', raw }); }

  return res.json(result);
});
```

- [ ] **Step 2: Modify character generation prompt to include suggestions**

Update `CHAR_GEN_SYSTEM` to also request `refine_suggestions`:

```javascript
const CHAR_GEN_SYSTEM = `You are a character creation assistant. Generate a structured character card as JSON with this exact shape:
{"name":"","identity":{"description":"","personality":"","background":""},"power_tier":1,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]},"refine_suggestions":{"identity":["suggestion1","suggestion2"],"voice":["suggestion1"],"current_state":["suggestion1"]}}
The refine_suggestions field should contain 2-3 actionable improvement directions per section.
Assign a power_tier consistent with the world's power system. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;
```

- [ ] **Step 3: Add frontend API methods**

In `frontend/src/api/generate.js`, add both `suggestRefine` and `refineCharacter` (the backend endpoint `POST /generate/character/refine` already exists but has no frontend method):
```javascript
refineCharacter: (draft, section, instruction, apiConfig) =>
  apiFetch(`${BASE}/character/refine`, {
    method: 'POST',
    body: JSON.stringify({ draft, section, instruction, apiConfig }),
  }),

suggestRefine: (draft, section, apiConfig) =>
  apiFetch(`${BASE}/character/suggest-refine`, {
    method: 'POST',
    body: JSON.stringify({ draft, section, apiConfig }),
  }),
```

- [ ] **Step 4: Commit**

```bash
git add src/endpoints/world-simulation/generate.js frontend/src/api/generate.js
git commit -m "feat: add suggest-refine endpoint and refine_suggestions in character gen"
```

---

## Task 8: useDraftWizard — Refine Suggestions State

**Files:**
- Modify: `frontend/src/hooks/useDraftWizard.js`

- [ ] **Step 1: Add refineSuggestions state and handler**

Add to the hook:
```javascript
const [refineSuggestions, setRefineSuggestions] = useState({});
```

In `handleGenerate`, replace `setDraft(d)` with extraction logic:
```javascript
// In handleGenerate, after line: const { draft: d } = await generateFn(description, cfg);
const { refine_suggestions, ...cleanDraft } = d || {};
if (refine_suggestions) {
  setRefineSuggestions(refine_suggestions);
}
setDraft(cleanDraft);
```
This strips `refine_suggestions` from the draft before setting state, avoiding polluted character data.

Add refresh handler:
```javascript
const handleRefreshSuggestions = useCallback(async (section) => {
  const currentDraft = draftRef.current;
  if (!currentDraft || !section) return;
  try {
    const { suggestions } = await generateApi.suggestRefine(currentDraft, section, getApiConfig());
    setRefineSuggestions(prev => ({ ...prev, [section]: suggestions }));
  } catch {
    // Silent fail — suggestions are non-critical
  }
}, [getApiConfig]);
```

Add `refineSuggestions`, `setRefineSuggestions`, and `handleRefreshSuggestions` to the returned object.

Note: `generateApi` must be imported at top: `import { generateApi } from '../api/generate.js';`

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useDraftWizard.js
git commit -m "feat: add refineSuggestions state to useDraftWizard"
```

---

## Task 9: RefineDialog — Suggestion Chips + Refresh

**Files:**
- Modify: `frontend/src/components/wizard/RefineDialog.jsx`

- [ ] **Step 1: Rewrite RefineDialog with suggestions**

```jsx
import { useState } from 'react';

export default function RefineDialog({ section, suggestions = [], onConfirm, onCancel, onRefreshSuggestions }) {
  const [instruction, setInstruction] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    if (!onRefreshSuggestions) return;
    setRefreshing(true);
    try { await onRefreshSuggestions(); }
    finally { setRefreshing(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-parchment border border-ink/15 rounded-xl shadow-lg w-full max-w-md mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-ink">细化「{section}」</h3>
          {onRefreshSuggestions && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="text-[10px] text-ink/40 hover:text-ink/70 transition-colors disabled:opacity-40"
            >
              {refreshing ? '刷新中…' : '刷新建议'}
            </button>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-ink/40 uppercase tracking-wider mb-2">AI 建议</p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setInstruction(prev => prev ? `${prev}；${s}` : s)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-ink/10 text-ink/60 hover:border-ink/25 hover:text-ink/80 transition-colors text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          className="w-full border border-ink/12 rounded-lg p-2.5 text-sm bg-white/60 focus:outline-none focus:border-ink/30 resize-none"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="输入细化方向，或点击上方建议…"
        />
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={onCancel} className="text-xs text-ink/40 hover:text-ink/70 px-3 py-1.5">取消</button>
          <button
            onClick={() => instruction.trim() && onConfirm(instruction.trim())}
            disabled={!instruction.trim()}
            className="text-xs bg-ink/8 hover:bg-ink/15 text-ink/70 px-4 py-1.5 rounded-lg disabled:opacity-30 transition-colors"
          >
            确认细化
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/wizard/RefineDialog.jsx
git commit -m "feat: RefineDialog with AI suggestion chips and refresh"
```

---

## Task 10: ProtagonistBioStep — Sequential World-NPC Generation

**Files:**
- Modify: `frontend/src/components/setup/ProtagonistBioStep.jsx`

- [ ] **Step 1: Add sequential world-npcs call**

Modify the `handleAnalyze` function. After the protagonist call succeeds, call world-npcs with the count of protagonist NPCs:

Add a `loadingPhase` state variable: `const [loadingPhase, setLoadingPhase] = useState(null);` — values: `'protagonist'`, `'world'`, or `null`.

```javascript
async function handleAnalyze() {
  if (!bio.trim()) return;
  setLoadingPhase('protagonist');
  setError(null);
  try {
    // Step 1: Extract NPCs from protagonist bio
    const result = await generateApi.protagonist(bio, worldContext, apiConfig);
    const protagonistNpcs = result.core_npcs || [];

    // Step 2: Generate world-background NPCs (at least as many as protagonist NPCs)
    let worldNpcs = [];
    if (protagonistNpcs.length > 0) {
      setLoadingPhase('world');
      try {
        const worldResult = await generateApi.worldNpcs(worldContext, bio, protagonistNpcs.length, apiConfig);
        worldNpcs = worldResult.world_npcs || [];
      } catch {
        // Non-fatal: proceed with protagonist NPCs only
        console.warn('World NPC generation failed, continuing with protagonist NPCs only');
      }
    }

    onComplete({ protagonistNpcs, worldNpcs }, bio);
  } catch {
    setError('分析失败，请重试');
  } finally {
    setLoadingPhase(null);
  }
}
```

In the JSX, show phase-appropriate loading text:
```jsx
{loadingPhase && (
  <p className="text-xs text-ink/50 mt-2">
    {loadingPhase === 'protagonist' ? '正在分析主角小传…' : '正在生成世界人物…'}
  </p>
)}
```

Replace the old `analyzing` boolean with `loadingPhase`: `disabled={!!loadingPhase}` on the submit button, etc.

Update the `onComplete` callback signature — the parent `SetupPage` must now handle `{ protagonistNpcs, worldNpcs }` instead of a flat array.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/setup/ProtagonistBioStep.jsx
git commit -m "feat: sequential world-NPC generation in ProtagonistBioStep"
```

---

## Task 11: CoreNpcStep — Two-Group Display + Refine Wiring

**Files:**
- Modify: `frontend/src/components/setup/CoreNpcStep.jsx`

- [ ] **Step 1: Rewrite CoreNpcStep for two groups and refine support**

Major changes:
- Replace `suggestions` prop with `protagonistNpcs` and `worldNpcs`
- Combine into a single ordered list with group labels
- Add local `refineSuggestions` state
- Wire up `onRefine` to open RefineDialog with suggestions
- Import RefineDialog and generateApi

The component iterates through both groups sequentially. Display a group header when transitioning between groups. Use the same generate/save/skip flow for both.

Key structural changes:
```jsx
// Props change
export default function CoreNpcStep({
  worldId, worldContext, playerName, protagonistBio,
  protagonistNpcs = [], worldNpcs = [], apiConfig, onComplete,
}) {
  const allSuggestions = [
    ...protagonistNpcs.map(s => ({ ...s, source: 'protagonist' })),
    ...worldNpcs.map(s => ({ ...s, source: 'world' })),
  ];
  // ... rest uses allSuggestions instead of suggestions
  // Group headers rendered when source changes between items
}
```

Add refine flow:
```jsx
const [refiningSection, setRefiningSection] = useState(null);
const [refineSuggestions, setRefineSuggestions] = useState({});

function handleRefine(section) {
  setRefiningSection(section);
}

async function handleRefineConfirm(instruction) {
  const section = refiningSection;
  setRefiningSection(null);
  setDraft(prev => ({ ...prev, _refining: section }));
  try {
    const { draft: refined } = await generateApi.refineCharacter(draft, section, instruction, apiConfig);
    setDraft(refined);
  } catch {
    setError('细化失败，请重试');
    setDraft(prev => { const { _refining, ...d } = prev || {}; return d; });
  }
}

async function handleRefreshSuggestions() {
  if (!refiningSection || !draft) return;
  try {
    const { suggestions } = await generateApi.suggestRefine(draft, refiningSection, apiConfig);
    setRefineSuggestions(prev => ({ ...prev, [refiningSection]: suggestions }));
  } catch { /* silent */ }
}
```

- [ ] **Step 2: Update SetupPage to pass new props**

In `SetupPage.jsx`:
1. Rename the state variable from `const [coreNpcSuggestions, setCoreNpcSuggestions] = useState([])` to `const [coreNpcResult, setCoreNpcResult] = useState(null)`
2. Update the ProtagonistBioStep `onComplete` handler: it now receives `{ protagonistNpcs, worldNpcs }` instead of a flat array:
```jsx
// Old: onComplete={(suggestions) => { setCoreNpcSuggestions(suggestions); setStep(2); }}
// New:
onComplete={(result) => { setCoreNpcResult(result); setStep(2); }}
```
3. Update CoreNpcStep rendering:
```jsx
<CoreNpcStep
  worldId={worldId}
  worldContext={world}
  playerName={playerName}
  protagonistBio={protagonistBio}
  protagonistNpcs={coreNpcResult?.protagonistNpcs || []}
  worldNpcs={coreNpcResult?.worldNpcs || []}
  apiConfig={apiConfig}
  onComplete={handleCoreNpcComplete}
/>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/setup/CoreNpcStep.jsx frontend/src/pages/SetupPage.jsx
git commit -m "feat: CoreNpcStep two-group display with refine support"
```

---

## Task 12: Core NPC Familiarity Initialization

**Files:**
- Modify: `src/endpoints/world-simulation/characters.js`

- [ ] **Step 1: Add familiarity initialization on core NPC creation**

In the `POST /` create handler, after saving the character, if `is_core` is true, evaluate initial familiarity:

```javascript
const INIT_FAMILIARITY_SYSTEM = `You are a relationship analyst. Given a protagonist's biography and an NPC's relationship to them, estimate how familiar they would be on a scale of 0-100.
Return JSON: {"initial_familiarity": <number>}
Guidelines: Close family=60-80, Best friend/mentor=40-60, Acquaintance=15-30, Stranger met through events=5-15
IMPORTANT: Respond only with valid JSON.`;

// In POST / handler, after writeCharacter:
if (char.is_core && char.world_id && req.body.protagonistBio) {
  // Fire-and-forget: initialize familiarity
  (async () => {
    try {
      const raw = await callLLM(
        [{ role: 'user', content: `Protagonist bio: ${req.body.protagonistBio}\nNPC: ${char.name}\nRelationship: ${char.current_state?.relationship_to_player || 'unknown'}` }],
        INIT_FAMILIARITY_SYSTEM,
        req.body.apiConfig || {}
      );
      const parsed = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim());
      const familiarity = Math.max(0, Math.min(100, parseInt(parsed.initial_familiarity) || 20));

      const { readRelationships, writeRelationships } = await import('./storage/relationships.js');
      const relData = await readRelationships(req.user.directories, char.world_id);
      relData.relationships[char.id] = { familiarity, last_interaction: new Date().toISOString() };
      await writeRelationships(req.user.directories, char.world_id, relData);
    } catch (err) {
      console.warn('[characters] familiarity init failed, defaulting to 20:', err.message);
      // Fallback: write default familiarity
      try {
        const { readRelationships, writeRelationships } = await import('./storage/relationships.js');
        const relData = await readRelationships(req.user.directories, char.world_id);
        relData.relationships[char.id] = { familiarity: 20, last_interaction: null };
        await writeRelationships(req.user.directories, char.world_id, relData);
      } catch { /* give up */ }
    }
  })();
}
```

Also add dark-side generation for 20% of core NPCs (fire-and-forget):

```javascript
if (char.is_core && (char.tier === 'legendary' || char.tier === 'elite')) {
  // 20% chance of dark-side
  if (Math.random() < 0.2) {
    callLLM(
      [{ role: 'user', content: `NPC: ${char.name}\nDescription: ${char.identity?.description || ''}\nPersonality: ${char.identity?.personality || ''}` }],
      DARK_SIDE_SYSTEM,
      req.body.apiConfig || {}
    ).then(async (raw) => {
      try {
        const ht = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim());
        char.hidden_traits = ht;
        await writeCharacter(req.user.directories, char.id, char);
      } catch { /* skip */ }
    }).catch(() => { /* silent */ });
  }
}
```

Note: Import `callLLM` from `./llm-client.js` and `DARK_SIDE_SYSTEM` from `./prompts.js` at top of `characters.js`:
```javascript
import { callLLM } from './llm-client.js';
import { DARK_SIDE_SYSTEM } from './prompts.js';
```

- [ ] **Step 2: Pass protagonistBio from frontend**

In `CoreNpcStep.jsx`, when calling `charactersApi.create(char)`, include `protagonistBio` in the request body so the backend can use it for familiarity evaluation.

- [ ] **Step 3: Commit**

```bash
git add src/endpoints/world-simulation/characters.js frontend/src/components/setup/CoreNpcStep.jsx
git commit -m "feat: initialize familiarity and dark-side for core NPCs on creation"
```

---

## Task 13: WorldPage — Load Relationships + Evaluate on Turn Complete

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`
- Modify: `frontend/src/api/chat.js`

- [ ] **Step 1: Add relationships state and loading**

In `WorldPage.jsx`, add state and load relationships:
```javascript
const [relationships, setRelationships] = useState({});

// In the Promise.all (line 58), add:
relationshipsApi.get(worldId).catch(() => ({ relationships: {} })),

// In the .then callback, destructure and set:
// .then(([w, p, s, chars, rels]) => {
//   ...existing...
//   setRelationships(rels.relationships || {});
// })
```

- [ ] **Step 2: Add familiarity evaluation to handleTurnComplete**

After the existing event proposal logic:
```javascript
// Familiarity evaluation (fire-and-forget)
if (selectedCharacterId) {
  const charBlocks = useChatStore.getState().blocks.filter(b => b.characterId === selectedCharacterId);
  const lastBlock = charBlocks[charBlocks.length - 1];
  if (lastBlock) {
    const recentMsgs = lastBlock.messages.slice(-3);
    relationshipsApi.evaluate(worldId, selectedCharacterId, recentMsgs, apiConfig)
      .then((result) => {
        setRelationships(prev => ({
          ...prev,
          [selectedCharacterId]: {
            ...(prev[selectedCharacterId] || {}),
            familiarity: result.familiarity,
            last_interaction: new Date().toISOString(),
          },
        }));
      })
      .catch((err) => console.warn('[WorldPage] familiarity evaluate failed:', err.message));
  }
}
```

- [ ] **Step 3: Pass worldId and activeCharacterId to buildContext**

In `frontend/src/api/chat.js`, modify the `buildContext` call in `ChatPane` to include `worldId` and `activeCharacterId`. These are already available as props.

In `ChatPane.jsx`, update the `buildContext` call:
```javascript
const { systemPrompt, trimmedChatHistory } = await buildContext({
  worldCard: worldData,
  chatHistory: allMessages,
  tokenBudget,
  mode: narrativeMode || 'ensemble',
  playerStatus,
  currentScene,
  characters,
  activeCharacters: [activeCharacterId],
  worldId,                    // NEW
  activeCharacterId,          // NEW
});
```

- [ ] **Step 4: Pass relationships to CharacterSelector**

```jsx
<CharacterSelector
  characters={visibleCharacters}
  selectedId={selectedCharacterId}
  onSelect={setSelectedCharacterId}
  relationships={relationships}
/>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WorldPage.jsx frontend/src/components/chat/ChatPane.jsx frontend/src/api/chat.js
git commit -m "feat: load relationships, evaluate familiarity on turn complete"
```

---

## Task 14: CharacterSelector — Familiarity Indicator

**Files:**
- Modify: `frontend/src/components/world/CharacterSelector.jsx`

- [ ] **Step 1: Add familiarity display**

Add `relationships` prop and show familiarity next to each character name:

```jsx
import { TIER_DOTS } from '../../constants/tiers.js';

export default function CharacterSelector({ characters, selectedId, onSelect, relationships = {} }) {
  if (characters.length === 0) return (
    <div>
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">对话角色</p>
      <p className="text-xs text-ink/40">当前场景暂无角色</p>
    </div>
  );

  return (
    <div>
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-1">对话角色</p>
      <ul className="space-y-0.5">
        {characters.map((c) => {
          const fam = relationships[c.id]?.familiarity || 0;
          return (
            <li key={c.id}>
              <button
                className={`w-full text-left text-xs py-1 px-1.5 rounded transition-colors flex items-center justify-between ${
                  selectedId === c.id ? 'text-ink bg-ink/5' : 'text-ink/50 hover:text-ink/80'
                }`}
                onClick={() => onSelect(c.id)}
              >
                <span className="truncate">
                  {TIER_DOTS[c.tier] ? `${TIER_DOTS[c.tier]} ` : ''}{c.name}
                </span>
                {fam > 0 && (
                  <span className="text-[9px] text-ink/25 ml-1 shrink-0">{fam}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/world/CharacterSelector.jsx
git commit -m "feat: show familiarity indicator in CharacterSelector"
```

---

## Task 15: WorldArchivePage — Familiarity-Gated Display

**Files:**
- Modify: `frontend/src/pages/WorldArchivePage.jsx`

- [ ] **Step 1: Load relationships data**

At the **top of the file** (with other imports), add:
```javascript
import { relationshipsApi } from '../api/relationships.js';
```

Inside the component, add state and update the existing `Promise.all`:
```javascript
// Add state:
const [relationships, setRelationships] = useState({});

// In useEffect Promise.all, add as the last item:
relationshipsApi.get(worldId).catch(() => ({ relationships: {} })),

// In .then, destructure and set:
setRelationships(rels.relationships || {});
```

- [ ] **Step 2: Modify character tab rendering**

Replace the character display section (~lines 110-138) with familiarity-gated rendering:

```jsx
{group.map((c) => {
  const rel = relationships[c.id] || {};
  const fam = rel.familiarity || 0;
  const unlocked = fam >= 50;

  return (
    <div key={c.id} className="py-2.5 border-t border-ink/5 first:border-t-0">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink">{c.name}</p>
        <span className="text-[10px] text-ink/25">{fam}%</span>
      </div>
      {/* Familiarity bar */}
      <div className="h-0.5 bg-ink/8 rounded-full mt-1.5 mb-2">
        <div className="h-full bg-ink/30 rounded-full transition-all" style={{ width: `${fam}%` }} />
      </div>

      {unlocked ? (
        <div className="space-y-1.5 text-xs text-ink/50">
          {c.identity?.description && <p>{c.identity.description}</p>}
          {c.identity?.personality && <p><span className="text-ink/30">性格：</span>{c.identity.personality}</p>}
          {c.identity?.background && <p><span className="text-ink/30">背景：</span>{c.identity.background}</p>}
          {c.voice?.style && <p><span className="text-ink/30">语气：</span>{c.voice.style}</p>}
          {c.current_state?.relationship_to_player && (
            <p><span className="text-ink/30">与主角关系：</span>{c.current_state.relationship_to_player}</p>
          )}

          {/* Dark side reveal */}
          {rel.dark_revealed && (
            <details className="mt-2 border border-red-200/30 rounded-lg">
              <summary className="px-3 py-1.5 cursor-pointer text-xs text-red-400/70">隐藏面</summary>
              <div className="px-3 pb-2 space-y-1">
                {rel.dark_personality && <p><span className="text-ink/30">隐藏性格：</span>{rel.dark_personality}</p>}
                {rel.dark_motivation && <p><span className="text-ink/30">隐藏动机：</span>{rel.dark_motivation}</p>}
              </div>
            </details>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink/25 italic">了解不足，无法查看详情</p>
      )}
    </div>
  );
})}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WorldArchivePage.jsx
git commit -m "feat: familiarity-gated character display in archive"
```

---

## Task 16: Final Integration — Verify End-to-End

- [ ] **Step 1: Build frontend and verify no compilation errors**

```bash
cd frontend && npm run build
```

- [ ] **Step 2: Run existing tests**

```bash
npx vitest run
```
Check that no existing passing tests have broken.

- [ ] **Step 3: Manual smoke test checklist**

1. Create a new world → protagonist bio step generates both protagonist NPCs and world NPCs
2. CoreNpcStep shows two groups with headers
3. Click "细化" on a section → RefineDialog shows AI suggestions + custom input
4. Save core NPCs → relationships initialized with familiarity values
5. Enter world → CharacterSelector shows familiarity numbers
6. Chat with an NPC → handleTurnComplete evaluates familiarity (check console for no errors)
7. Archive page → characters below 50% show locked state
8. Archive page → characters above 50% show full details

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: NPC depth system — familiarity, dark-side, world NPCs, enhanced refine"
```
