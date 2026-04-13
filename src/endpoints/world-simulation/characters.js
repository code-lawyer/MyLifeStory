import express from 'express';
import { readCharacter, writeCharacter, listCharacters, deleteCharacter } from './storage/characters.js';
import { validateIdParams, isValidId } from './validate-id.js';
import { callLLMForJson } from './llm-helpers.js';
import { DARK_SIDE_SYSTEM } from './prompts.js';
import { readRelationships, writeRelationships } from './storage/relationships.js';

export const router = express.Router();
const vId = validateIdParams('charId');

function stripHidden(char) {
    if (!char) return char;
    const { hidden_traits: _hidden_traits, ...safe } = char;
    return safe;
}

// GET / — list all characters
router.get('/', async (req, res) => {
    try {
        const chars = await listCharacters(req.user.directories, req.query.worldId || null);
        res.json(chars.map(stripHidden));
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// GET /:charId
router.get('/:charId', vId, async (req, res) => {
    try {
        const char = await readCharacter(req.user.directories, req.params.charId);
        if (!char) return res.status(404).json({ error: 'character_not_found' });
        res.json(stripHidden(char));
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

const INIT_FAMILIARITY_SYSTEM = `You are a relationship analyst. Given a protagonist's biography and an NPC's relationship to them, estimate how familiar they would be on a scale of 0-100.
Return JSON: {"initial_familiarity": <number>}
Guidelines: Close family=60-80, Best friend/mentor=40-60, Acquaintance=15-30, Stranger met through events=5-15
IMPORTANT: Respond only with valid JSON.`;

// POST / — create
router.post('/', async (req, res) => {
    try {
        const { protagonistBio, apiConfig, ...charFields } = req.body;
        const char = charFields;
        if (!char?.id || !char?.name) return res.status(400).json({ error: 'missing_fields', required: ['id', 'name'] });
        if (!isValidId(char.id)) return res.status(400).json({ error: 'invalid_id' });
        await writeCharacter(req.user.directories, char.id, char);
        res.status(201).json(stripHidden(char));

        if (char.is_core && char.world_id && protagonistBio) {
            (async () => {
                try {
                    const parsed = await callLLMForJson(
                        [{ role: 'user', content: `Protagonist bio: ${protagonistBio}\nNPC: ${char.name}\nRelationship: ${char.current_state?.relationship_to_player || 'unknown'}` }],
                        INIT_FAMILIARITY_SYSTEM,
                        apiConfig || {},
                    );
                    const familiarity = Math.max(0, Math.min(100, parseInt(parsed.initial_familiarity) || 20));

                    const relData = await readRelationships(req.user.directories, char.world_id);
                    relData.relationships[char.id] = { familiarity, last_interaction: new Date().toISOString() };
                    await writeRelationships(req.user.directories, char.world_id, relData);
                } catch (err) {
                    console.warn('[characters] familiarity init failed, defaulting to 20:', err.message);
                    try {
                        const relData = await readRelationships(req.user.directories, char.world_id);
                        relData.relationships[char.id] = { familiarity: 20, last_interaction: null };
                        await writeRelationships(req.user.directories, char.world_id, relData);
                    } catch { /* give up */ }
                }
            })().catch(() => {});
        }

        if (char.is_core && (char.tier === 'legendary' || char.tier === 'elite') && Math.random() < 0.2) {
            callLLMForJson(
                [{ role: 'user', content: `NPC: ${char.name}\nDescription: ${char.identity?.description || ''}\nPersonality: ${char.identity?.personality || ''}` }],
                DARK_SIDE_SYSTEM,
                apiConfig || {},
            ).then(async (ht) => {
                try {
                    const latest = await readCharacter(req.user.directories, char.id);
                    if (latest) await writeCharacter(req.user.directories, char.id, { ...latest, hidden_traits: ht });
                } catch { /* skip */ }
            }).catch((err) => { console.warn('[characters] dark side generation failed for', char.id, ':', err.message); });
        }
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PUT /:charId — replace
router.put('/:charId', vId, async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        if (req.body.id && req.body.id !== req.params.charId) return res.status(400).json({ error: 'id_mismatch' });
        const { hidden_traits: _ht, ...body } = req.body;
        const existing = await readCharacter(req.user.directories, req.params.charId);
        const updated = { ...existing, ...body, id: req.params.charId };
        if (existing?.hidden_traits) updated.hidden_traits = existing.hidden_traits;
        await writeCharacter(req.user.directories, req.params.charId, updated);
        res.json(stripHidden(updated));
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /:charId
router.delete('/:charId', vId, async (req, res) => {
    try {
        const char = await readCharacter(req.user.directories, req.params.charId);
        if (!char) return res.status(404).json({ error: 'character_not_found' });
        await deleteCharacter(req.user.directories, req.params.charId);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
