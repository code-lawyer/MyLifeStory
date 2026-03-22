import express from 'express';
import { readScenes, writeScenes } from './storage/scenes.js';
import { readPlayer, writePlayer } from './storage/players.js';
import { validateIdParams, isValidId } from './validate-id.js';

export const router = express.Router();
const vId = validateIdParams('worldId');
const vIds = validateIdParams('worldId', 'sceneId');

router.get('/:worldId', vId, async (req, res) => {
    try {
        res.json(await readScenes(req.user.directories, req.params.worldId));
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.post('/:worldId', vId, async (req, res) => {
    try {
        const scene = req.body;
        if (!scene?.id || !scene?.name) return res.status(400).json({ error: 'missing_fields' });
        if (!isValidId(scene.id)) return res.status(400).json({ error: 'invalid_id' });
        const data = await readScenes(req.user.directories, req.params.worldId);
        if (data.scenes.some(s => s.id === scene.id)) return res.status(409).json({ error: 'scene_id_exists' });
        data.scenes.push(scene);
        await writeScenes(req.user.directories, req.params.worldId, data);
        res.status(201).json(scene);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.get('/:worldId/:sceneId', vIds, async (req, res) => {
    try {
        const data = await readScenes(req.user.directories, req.params.worldId);
        const scene = data.scenes.find(s => s.id === req.params.sceneId);
        if (!scene) return res.status(404).json({ error: 'scene_not_found' });
        res.json(scene);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.put('/:worldId/:sceneId', vIds, async (req, res) => {
    try {
        const data = await readScenes(req.user.directories, req.params.worldId);
        const idx = data.scenes.findIndex(s => s.id === req.params.sceneId);
        if (idx === -1) return res.status(404).json({ error: 'scene_not_found' });
        data.scenes[idx] = { ...data.scenes[idx], ...req.body, id: req.params.sceneId };
        await writeScenes(req.user.directories, req.params.worldId, data);
        res.json(data.scenes[idx]);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.delete('/:worldId/:sceneId', vIds, async (req, res) => {
    try {
        const data = await readScenes(req.user.directories, req.params.worldId);
        data.scenes = data.scenes.filter(s => s.id !== req.params.sceneId);
        await writeScenes(req.user.directories, req.params.worldId, data);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST /:worldId/:sceneId/enter
router.post('/:worldId/:sceneId/enter', vIds, async (req, res) => {
    try {
        const dirs = req.user.directories;
        const data = await readScenes(dirs, req.params.worldId);
        const scene = data.scenes.find(s => s.id === req.params.sceneId);
        if (!scene) return res.status(404).json({ error: 'scene_not_found' });
        if (scene.is_locked) return res.status(403).json({ error: 'scene_locked', unlock_condition: scene.unlock_condition });

        // Update player location
        const player = await readPlayer(dirs, req.params.worldId);
        if (player) {
            player.status = player.status || {};
            player.status.current_location = req.params.sceneId;
            await writePlayer(dirs, req.params.worldId, player);
        }

        res.json({ scene, characters_present: scene.characters_present || [] });
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
