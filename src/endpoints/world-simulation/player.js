import express from 'express';
import { readPlayer, writePlayer } from './storage/players.js';
import { validateIdParams } from './validate-id.js';
import { callLLM } from './llm-client.js';

export const router = express.Router();
const vId = validateIdParams('worldId');

router.get('/:worldId', vId, async (req, res) => {
    try {
        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });
        res.json(player);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.post('/:worldId', vId, async (req, res) => {
    try {
        const player = req.body;
        if (!player?.name) return res.status(400).json({ error: 'missing_fields' });
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.status(201).json(player);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.put('/:worldId', vId, async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        await writePlayer(req.user.directories, req.params.worldId, req.body);
        res.json(req.body);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PATCH /status — update health/mental/reputation only (NOT current_location)
router.patch('/:worldId/status', vId, async (req, res) => {
    try {
        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });
        const { health, mental, reputation } = req.body;
        for (const [key, val] of Object.entries({ health, mental, reputation })) {
            if (val !== undefined && (typeof val !== 'number' || !Number.isFinite(val))) {
                return res.status(400).json({ error: 'invalid_value', field: key });
            }
        }
        const clamp = (v) => Math.max(0, Math.min(100, v));
        player.status = player.status || {};
        if (health !== undefined) player.status.health = clamp(health);
        if (mental !== undefined) player.status.mental = clamp(mental);
        if (reputation !== undefined) player.status.reputation = clamp(reputation);
        // current_location is intentionally excluded — use /scenes/:id/enter
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.json(player);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.post('/:worldId/inventory', vId, async (req, res) => {
    try {
        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });
        const item = req.body;
        if (!item?.id || !item?.name) return res.status(400).json({ error: 'missing_fields' });
        player.inventory = player.inventory || [];
        player.inventory.push(item);
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.status(201).json(item);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.delete('/:worldId/inventory/:itemId', vId, async (req, res) => {
    try {
        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });
        player.inventory = (player.inventory || []).filter(i => i.id !== req.params.itemId);
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

const PLAYER_DRIFT_SYSTEM = `你是命运裁判。根据事件，用JSON输出玩家三项属性的变化量。格式：{"health":N,"mental":N,"reputation":N}，N为整数。只输出JSON，不要解释。`;

// POST /:worldId/drift — update player status after an event
router.post('/:worldId/drift', vId, async (req, res) => {
    try {
        const { event, apiConfig = {} } = req.body;
        if (!event?.title) return res.status(400).json({ error: 'missing_fields' });

        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });

        const { health = 0, mental = 0, reputation = 0 } = player.status || {};
        const userMessage = [
            `当前状态：生命值${health}，精神值${mental}，声望${reputation}`,
            `事件（${event.impact_scope || 'moderate'}）：${event.title} — ${event.description || ''}`,
        ].join('\n');

        let delta;
        try {
            const raw = await callLLM([{ role: 'user', content: userMessage }], PLAYER_DRIFT_SYSTEM, apiConfig);
            delta = JSON.parse(raw);
        } catch {
            return res.json({ player });
        }

        const clamp = (v) => Math.max(0, Math.min(100, v));
        player.status = {
            ...(player.status || {}),
            health:     clamp(health     + (delta.health     || 0)),
            mental:     clamp(mental     + (delta.mental     || 0)),
            reputation: clamp(reputation + (delta.reputation || 0)),
        };
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.json({ player });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
