import express from 'express';
import { readWorld, writeWorld } from './storage/worlds.js';
import { readEvents } from './storage/events.js';
import { readSummaries } from './storage/summaries.js';
import { callLLM } from './llm-client.js';
import { validateIdParams } from './validate-id.js';

export const router = express.Router();
const vId = validateIdParams('worldId');

const STATE_SYSTEM = `You are a world historian. Given a list of world events, write a concise 2-3 sentence summary of the current world state in Chinese. Output plain text only.`;

// GET /:worldId
router.get('/:worldId', vId, async (req, res) => {
    try {
        const worldId = req.params.worldId;
        const world = await readWorld(req.user.directories, worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });

        const events = await readEvents(req.user.directories, worldId);
        const summaries = await readSummaries(req.user.directories, worldId).catch(() => ({ summaries: [] }));
        res.json({ current_state: world.current_state, event_count: events.events.length, summaries: summaries.summaries });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId/update
router.post('/:worldId/update', vId, async (req, res) => {
    try {
        const dirs = req.user.directories;
        const worldId = req.params.worldId;
        const { apiConfig = {} } = req.body || {};

        const world = await readWorld(dirs, worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });

        const events = await readEvents(dirs, worldId);
        const summaries = await readSummaries(dirs, worldId);

        const MAX_EVENTS_FOR_LLM = 20;
        const recentEvents = events.events.slice(-MAX_EVENTS_FOR_LLM);
        const context = [
            ...(summaries.summaries.map(s => ({ role: 'assistant', content: s.summary }))),
            { role: 'user', content: JSON.stringify(recentEvents) },
        ];

        let newSummary;
        try {
            newSummary = await callLLM(context, STATE_SYSTEM, apiConfig);
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        world.current_state = { summary: newSummary, updated_at: new Date().toISOString(), event_count: events.events.length };
        await writeWorld(dirs, worldId, world);
        res.json({ current_state: world.current_state });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
