import express from 'express';
import { readCharacter, writeCharacter, listCharacters, deleteCharacter } from './storage/characters.js';
import { validateIdParams, isValidId } from './validate-id.js';

export const router = express.Router();
const vId = validateIdParams('charId');

function stripHidden(char) {
  if (!char) return char;
  const { hidden_traits, ...safe } = char;
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

// POST / — create
router.post('/', async (req, res) => {
    try {
        const char = req.body;
        if (!char?.id || !char?.name) return res.status(400).json({ error: 'missing_fields', required: ['id', 'name'] });
        if (!isValidId(char.id)) return res.status(400).json({ error: 'invalid_id' });
        await writeCharacter(req.user.directories, char.id, char);
        res.status(201).json(char);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PUT /:charId — replace
router.put('/:charId', vId, async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        if (req.body.id && req.body.id !== req.params.charId) return res.status(400).json({ error: 'id_mismatch' });
        const { hidden_traits: _, ...body } = req.body;
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
