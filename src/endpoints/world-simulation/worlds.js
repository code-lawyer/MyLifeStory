import crypto from 'node:crypto';
import express from 'express';
import { readWorld, writeWorld, listWorlds, deleteWorld } from './storage/worlds.js';
import { listCharacters, writeCharacter } from './storage/characters.js';
import { readScenes, writeScenes } from './storage/scenes.js';
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

// GET /:worldId/export — export world + characters + scenes as single JSON
router.get('/:worldId/export', vId, async (req, res) => {
    try {
        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });
        const characters = await listCharacters(req.user.directories, req.params.worldId);
        const scenesData = await readScenes(req.user.directories, req.params.worldId);
        const bundle = { _type: 'mylifestory_world', world, characters, scenes: scenesData.scenes || [] };
        res.setHeader('Content-Disposition', `attachment; filename="world-${encodeURIComponent(world.name || world.id)}.json"`);
        res.json(bundle);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST /import — import world bundle, assign new IDs
router.post('/import', async (req, res) => {
    try {
        const { world, characters = [], scenes = [] } = req.body;
        if (!world || !world.name) return res.status(400).json({ error: 'invalid_bundle' });
        const newWorldId = crypto.randomUUID();
        const idMap = {};
        const newWorld = { ...world, id: newWorldId, imported_at: new Date().toISOString() };
        await writeWorld(req.user.directories, newWorldId, newWorld);
        for (const char of characters) {
            const newCharId = crypto.randomUUID();
            idMap[char.id] = newCharId;
            await writeCharacter(req.user.directories, newCharId, { ...char, id: newCharId, world_id: newWorldId });
        }
        const newScenes = scenes.map(s => ({ ...s, id: crypto.randomUUID() }));
        if (newScenes.length > 0) {
            await writeScenes(req.user.directories, newWorldId, { scenes: newScenes });
        }
        res.status(201).json({ worldId: newWorldId, characters: characters.length, scenes: newScenes.length });
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
