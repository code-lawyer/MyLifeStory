import express from 'express';
import { readWorld, writeWorld, listWorlds, deleteWorld } from './storage/worlds.js';
import { validateIdParams, isValidId } from './validate-id.js';

export const router = express.Router();

// GET / — list all worlds
router.get('/', async (req, res) => {
    try {
        const worlds = await listWorlds(req.user.directories);
        res.json(worlds);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

const vId = validateIdParams('worldId');

// GET /:worldId
router.get('/:worldId', vId, async (req, res) => {
    try {
        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });
        res.json(world);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST / — create
router.post('/', async (req, res) => {
    try {
        const world = req.body;
        if (!world?.id || !world?.name) return res.status(400).json({ error: 'missing_fields', required: ['id', 'name'] });
        if (!isValidId(world.id)) return res.status(400).json({ error: 'invalid_id' });
        await writeWorld(req.user.directories, world.id, world);
        res.status(201).json(world);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PUT /:worldId — replace
router.put('/:worldId', vId, async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        if (req.body.id && req.body.id !== req.params.worldId) return res.status(400).json({ error: 'id_mismatch' });
        const data = { ...req.body, id: req.params.worldId };
        await writeWorld(req.user.directories, req.params.worldId, data);
        res.json(data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /:worldId
router.delete('/:worldId', vId, async (req, res) => {
    try {
        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });
        await deleteWorld(req.user.directories, req.params.worldId);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
