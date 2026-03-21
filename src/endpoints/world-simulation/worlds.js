import express from 'express';
import { readWorld, writeWorld, listWorlds, deleteWorld } from './storage/worlds.js';

export const router = express.Router();

// GET /worlds — list all worlds
router.get('/worlds', async (req, res) => {
    try {
        const worlds = await listWorlds(req.user.directories);
        res.json(worlds);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// GET /worlds/:worldId
router.get('/worlds/:worldId', async (req, res) => {
    try {
        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });
        res.json(world);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST /worlds — create
router.post('/worlds', async (req, res) => {
    try {
        const world = req.body;
        if (!world?.id || !world?.name) return res.status(400).json({ error: 'missing_fields', required: ['id', 'name'] });
        await writeWorld(req.user.directories, world.id, world);
        res.status(201).json(world);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PUT /worlds/:worldId — replace
router.put('/worlds/:worldId', async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        await writeWorld(req.user.directories, req.params.worldId, req.body);
        res.json(req.body);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /worlds/:worldId
router.delete('/worlds/:worldId', async (req, res) => {
    try {
        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });
        await deleteWorld(req.user.directories, req.params.worldId);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
