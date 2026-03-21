import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { readEvents } from './storage/events.js';
import { readSummaries } from './storage/summaries.js';
import { callLLM } from './llm-client.js';

export const router = express.Router();

const STATE_SYSTEM = `You are a world historian. Given a list of world events, write a concise 2-3 sentence summary of the current world state in Chinese. Output plain text only.`;

// GET /:worldId
router.get('/:worldId', async (req, res) => {
    try {
        const sanitizedId = sanitize(req.params.worldId);
        if (!sanitizedId) return res.status(400).json({ error: 'invalid_world_id' });
        const worldPath = path.join(req.user.directories.worlds, `${sanitizedId}.json`);
        let world;
        try {
            world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
        } catch (readErr) {
            if (readErr.code === 'ENOENT') return res.status(404).json({ error: 'world_not_found' });
            throw readErr;
        }
        const events = await readEvents(req.user.directories, req.params.worldId);
        const summaries = await readSummaries(req.user.directories, req.params.worldId);
        res.json({ current_state: world.current_state, event_count: events.events.length, summaries: summaries.summaries });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId/update
router.post('/:worldId/update', async (req, res) => {
    try {
        const dirs = req.user.directories;
        const { apiConfig = {} } = req.body || {};
        const sanitizedId = sanitize(req.params.worldId);
        if (!sanitizedId) return res.status(400).json({ error: 'invalid_world_id' });
        const worldPath = path.join(dirs.worlds, `${sanitizedId}.json`);

        let world;
        try {
            world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
        } catch (readErr) {
            if (readErr.code === 'ENOENT') return res.status(404).json({ error: 'world_not_found' });
            throw readErr;
        }
        const events = await readEvents(dirs, req.params.worldId);
        const summaries = await readSummaries(dirs, req.params.worldId);

        const context = [
            ...(summaries.summaries.map(s => ({ role: 'assistant', content: s.summary }))),
            { role: 'user', content: JSON.stringify(events.events) },
        ];

        let newSummary;
        try {
            newSummary = await callLLM(context, STATE_SYSTEM, apiConfig);
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        world.current_state = { summary: newSummary, updated_at: new Date().toISOString(), event_count: events.events.length };
        writeFileAtomicSync(worldPath, JSON.stringify(world, null, 2));
        res.json({ current_state: world.current_state });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
