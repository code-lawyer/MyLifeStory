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
