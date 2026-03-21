import express from 'express';
import { readCharacter, writeCharacter, listCharacters, deleteCharacter } from './storage/characters.js';

export const router = express.Router();

// GET / — list all characters
router.get('/', async (req, res) => {
    try {
        const chars = await listCharacters(req.user.directories, req.query.worldId || null);
        res.json(chars);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// GET /:charId
router.get('/:charId', async (req, res) => {
    try {
        const char = await readCharacter(req.user.directories, req.params.charId);
        if (!char) return res.status(404).json({ error: 'character_not_found' });
        res.json(char);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST / — create
router.post('/', async (req, res) => {
    try {
        const char = req.body;
        if (!char?.id || !char?.name) return res.status(400).json({ error: 'missing_fields', required: ['id', 'name'] });
        await writeCharacter(req.user.directories, char.id, char);
        res.status(201).json(char);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PUT /:charId — replace
router.put('/:charId', async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        await writeCharacter(req.user.directories, req.params.charId, req.body);
        res.json(req.body);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /:charId
router.delete('/:charId', async (req, res) => {
    try {
        const char = await readCharacter(req.user.directories, req.params.charId);
        if (!char) return res.status(404).json({ error: 'character_not_found' });
        await deleteCharacter(req.user.directories, req.params.charId);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
