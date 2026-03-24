import express from 'express';
import { readEvents, writeEvents, appendEvent, deleteEvent } from './storage/events.js';
import { readSummaries, writeSummaries } from './storage/summaries.js';
import { readScenes, writeScenes } from './storage/scenes.js';
import { callLLM } from './llm-client.js';
import { randomUUID } from 'node:crypto';
import { validateIdParams } from './validate-id.js';

export const router = express.Router();
const vId = validateIdParams('worldId');

// GET /:worldId — list events + summaries
router.get('/:worldId', vId, async (req, res) => {
    try {
        const [eventData, summaryData] = await Promise.all([
            readEvents(req.user.directories, req.params.worldId),
            readSummaries(req.user.directories, req.params.worldId),
        ]);
        res.json({ ...eventData, summaries: summaryData.summaries || [] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId — add confirmed event
router.post('/:worldId', vId, async (req, res) => {
    try {
        const event = req.body;
        if (!event?.id || !event?.title) {
            return res.status(400).json({ error: 'missing_fields', required: ['id', 'title'] });
        }
        await appendEvent(req.user.directories, req.params.worldId, event);

        // Unlock scenes that reference this event's id
        try {
            const sceneData = await readScenes(req.user.directories, req.params.worldId);
            const affected = sceneData.scenes.filter(s => s.unlocked_by_event === event.id);
            if (affected.length > 0) {
                sceneData.scenes = sceneData.scenes.map(s =>
                    s.unlocked_by_event === event.id ? { ...s, is_locked: false } : s
                );
                await writeScenes(req.user.directories, req.params.worldId, sceneData);
            }
        } catch (err) { console.error('[events] scene unlock failed (non-fatal):', err); }

        res.status(201).json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// DELETE /:worldId/:eventId — remove event
router.delete('/:worldId/:eventId', validateIdParams('worldId', 'eventId'), async (req, res) => {
    try {
        await deleteEvent(req.user.directories, req.params.worldId, req.params.eventId);
        res.sendStatus(204);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

const PROPOSE_SYSTEM = `You are a world narrator. Analyze the provided chat history.
If a significant world-changing event occurred, respond with JSON:
{"significant":true,"title":"...","description":"...","impact_scope":"minor|moderate|major","affected_characters":[],"narrative":"叙事化的中文提示，以"冥冥中"开头"}
If nothing significant occurred, respond with JSON: {"significant":false}
Only respond with JSON, no other text.`;

const COMPRESS_SYSTEM = `You are a world historian. Summarize the provided list of events into a single paragraph of narrative prose. Be concise. Output plain text only.`;

// POST /:worldId/propose
router.post('/:worldId/propose', vId, async (req, res) => {
    try {
        const { chatHistory, apiConfig = {} } = req.body;
        if (!chatHistory || !Array.isArray(chatHistory) || chatHistory.length === 0) {
            return res.status(400).json({ error: 'missing_fields' });
        }

        const messages = [{ role: 'user', content: JSON.stringify(chatHistory) }];
        let raw;
        try {
            raw = await callLLM(messages, PROPOSE_SYSTEM, apiConfig);
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        let parsed;
        try { parsed = JSON.parse(raw); }
        catch { return res.status(422).json({ error: 'parse_failed', raw }); }

        if (!parsed.significant) return res.json({ proposal: null });

        // Validate required fields from LLM response
        if (!parsed.title || !parsed.description || !parsed.narrative) {
            return res.status(422).json({ error: 'parse_failed', raw });
        }

        const event_draft = {
            id: randomUUID(),
            world_id: req.params.worldId,
            timestamp: new Date().toISOString(),
            title: parsed.title,
            description: parsed.description,
            impact_scope: parsed.impact_scope || 'moderate',
            affected_characters: parsed.affected_characters || [],
            confirmed_by_user: false,
        };

        res.json({ proposal: { narrative: parsed.narrative, event_draft } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId/compress — compress oldest non-major events into a summary
router.post('/:worldId/compress', vId, async (req, res) => {
    try {
        const dirs = req.user.directories;
        const { apiConfig = {} } = req.body || {};
        const data = await readEvents(dirs, req.params.worldId);

        const toCompress = data.events.filter(e => e.impact_scope !== 'major');
        const toKeep = data.events.filter(e => e.impact_scope === 'major');

        if (toCompress.length === 0) return res.json({ compressed: 0 });

        let summaryText;
        try {
            summaryText = await callLLM(
                [{ role: 'user', content: JSON.stringify(toCompress) }],
                COMPRESS_SYSTEM,
                apiConfig,
            );
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        const summaries = await readSummaries(dirs, req.params.worldId);
        summaries.summaries.push({
            period: `Events ${toCompress[0].id} – ${toCompress[toCompress.length - 1].id}`,
            summary: summaryText,
            compressed_at: new Date().toISOString(),
        });
        // Write summary first — if crash happens before writeEvents, events are still intact and retry is safe
        await writeSummaries(dirs, req.params.worldId, summaries);
        await writeEvents(dirs, req.params.worldId, { events: toKeep });

        res.json({ compressed: toCompress.length, kept: toKeep.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
