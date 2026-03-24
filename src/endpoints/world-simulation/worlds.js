import crypto from 'node:crypto';
import express from 'express';
import _ from 'lodash';
import sanitize from 'sanitize-filename';
import { readWorld, writeWorld, listWorlds, deleteWorld } from './storage/worlds.js';
import { listCharacters, readCharacter, writeCharacter } from './storage/characters.js';
import { readScenes, writeScenes } from './storage/scenes.js';
import { validateIdParams, isValidId } from './validate-id.js';
import { callLLM } from './llm-client.js';

export const router = express.Router();

const MAX_IMPORT_CHARACTERS = 200;
const MAX_IMPORT_SCENES = 100;

// Allowlisted fields for imported objects
const WORLD_FIELDS = ['name', 'foundation', 'power_system', 'current_state', 'scale', 'narrative_mode', 'onboarding_complete', 'created_at'];
const CHAR_FIELDS = ['name', 'identity', 'voice', 'current_state', 'power_tier', 'tier', 'is_core', 'is_template', 'world_id'];
const SCENE_FIELDS = ['name', 'description', 'is_locked', 'characters_present'];


// GET / — list all worlds
router.get('/', async (req, res) => {
    try {
        const worlds = await listWorlds(req.user.directories);
        res.json(worlds);
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

// POST /import — import world bundle, assign new IDs (MUST be before /:worldId routes)
router.post('/import', async (req, res) => {
    try {
        const { world, characters = [], scenes = [] } = req.body;
        if (!world || !world.name) return res.status(400).json({ error: 'invalid_bundle' });
        if (characters.length > MAX_IMPORT_CHARACTERS) return res.status(400).json({ error: 'too_many_characters', max: MAX_IMPORT_CHARACTERS });
        if (scenes.length > MAX_IMPORT_SCENES) return res.status(400).json({ error: 'too_many_scenes', max: MAX_IMPORT_SCENES });

        const newWorldId = crypto.randomUUID();
        const newWorld = { ..._.pick(world, WORLD_FIELDS), id: newWorldId, imported_at: new Date().toISOString() };
        await writeWorld(req.user.directories, newWorldId, newWorld);

        for (const char of characters) {
            const newCharId = crypto.randomUUID();
            const cleanChar = { ..._.pick(char, CHAR_FIELDS), id: newCharId, world_id: newWorldId };
            await writeCharacter(req.user.directories, newCharId, cleanChar);
        }

        const newScenes = scenes.map(s => ({ ..._.pick(s, SCENE_FIELDS), id: crypto.randomUUID() }));
        if (newScenes.length > 0) {
            await writeScenes(req.user.directories, newWorldId, { scenes: newScenes });
        }
        res.status(201).json({ worldId: newWorldId, characters: characters.length, scenes: newScenes.length });
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
        const characters = (await listCharacters(req.user.directories, req.params.worldId))
            .map(({ hidden_traits, ...c }) => c);
        const scenesData = await readScenes(req.user.directories, req.params.worldId);
        const bundle = { _type: 'mylifestory_world', world, characters, scenes: scenesData.scenes || [] };
        const safeName = sanitize(world.name || world.id, { replacement: '_' }).slice(0, 50);
        res.setHeader('Content-Disposition', `attachment; filename="world-${encodeURIComponent(safeName)}.json"`);
        res.json(bundle);
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

const NARRATE_SYSTEM = `你是世界叙事者。根据世界背景、当前状态和最新事件，用2~3句中文重写当前状态摘要。只输出摘要文本，不要标题、不要解释。`;

// POST /:worldId/narrate — update world current_state.summary after an event
router.post('/:worldId/narrate', vId, async (req, res) => {
    try {
        const { event, apiConfig = {} } = req.body;
        if (!event?.title) return res.status(400).json({ error: 'missing_fields' });

        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });

        const userMessage = [
            `世界背景：${world.foundation?.background || ''}`,
            `当前状态：${world.current_state?.summary || '（暂无）'}`,
            `最新事件（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`,
        ].join('\n\n');

        let newSummary;
        try {
            newSummary = (await callLLM([{ role: 'user', content: userMessage }], NARRATE_SYSTEM, apiConfig)).trim();
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        if (!newSummary) return res.json(world);

        const updated = {
            ...world,
            current_state: {
                ...(world.current_state || {}),
                summary: newSummary,
                last_updated: new Date().toISOString(),
            },
        };
        await writeWorld(req.user.directories, req.params.worldId, updated);
        res.json(updated);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

const NPC_DRIFT_SYSTEM = `你是世界叙事者。根据事件和角色当前状态，用1~2句中文更新角色的当前状态描述。只输出状态文本，不要标题、不要解释。`;

const SAFE_ID = /^[\w-]{1,64}$/;

// POST /:worldId/npc-drift — update affected active NPC statuses after an event
router.post('/:worldId/npc-drift', vId, async (req, res) => {
    try {
        const { event, activeCharacterIds, apiConfig = {} } = req.body;
        if (!event?.title || !Array.isArray(activeCharacterIds) || activeCharacterIds.length === 0) {
            return res.status(400).json({ error: 'missing_fields' });
        }

        const affected = Array.isArray(event.affected_characters) ? event.affected_characters : [];
        const targetIds = affected
            .filter(id => activeCharacterIds.includes(id))
            .filter(id => SAFE_ID.test(id));

        if (targetIds.length === 0) return res.json({ updated: [] });

        const results = await Promise.all(targetIds.map(async (charId) => {
            try {
                const char = await readCharacter(req.user.directories, charId);
                if (!char) return null;

                const userMessage = [
                    `角色：${char.name}`,
                    `当前状态：${char.current_state?.status || '（正常）'}`,
                    `性格：${char.identity?.personality || ''}`,
                    `事件（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`,
                ].join('\n');

                let newStatus;
                try {
                    newStatus = (await callLLM([{ role: 'user', content: userMessage }], NPC_DRIFT_SYSTEM, apiConfig)).trim();
                } catch (err) {
                    console.warn(`[npc-drift] LLM failed for ${charId}:`, err.message);
                    return null;
                }

                if (!newStatus) return null;

                const updated = {
                    ...char,
                    current_state: {
                        ...(char.current_state || {}),
                        status: newStatus,
                        last_updated: new Date().toISOString(),
                    },
                };
                await writeCharacter(req.user.directories, charId, updated);
                const { hidden_traits, ...safe } = updated;
                return safe;
            } catch (err) {
                console.warn(`[npc-drift] failed for ${charId}:`, err.message);
                return null;
            }
        }));

        res.json({ updated: results.filter(Boolean) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
