import express from 'express';
import { randomUUID } from 'node:crypto';
import { readWorld, writeWorld } from './storage/worlds.js';
import { readEvents } from './storage/events.js';
import { readSummaries } from './storage/summaries.js';
import { listCharacters } from './storage/characters.js';
import { callLLM } from './llm-client.js';
import { parseLLMJson } from './llm-helpers.js';
import { PERIOD_LABELS } from './format-helpers.js';
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
        const summaries = await readSummaries(dirs, worldId).catch(() => ({ summaries: [] }));

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

const TICK_SYSTEM = `你是世界叙事者。根据世界状态和角色动态，判断是否应该生成一个由NPC自发引起的世界事件。
如果是，返回JSON：
{"significant":true,"title":"...","description":"...","impact_scope":"minor|moderate","affected_characters":[],"narrative":"叙事化提示，以「不知何时起」或「听闻」开头"}
如果世界状态暂时不适合产生新事件，返回：{"significant":false}
只返回JSON，不要解释。`;

// POST /:worldId/tick — world heartbeat: generate NPC-driven event if new day
router.post('/:worldId/tick', vId, async (req, res) => {
    try {
        const { apiConfig = {} } = req.body || {};
        const dirs = req.user.directories;
        const worldId = req.params.worldId;

        const world = await readWorld(dirs, worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });

        const clock = world.clock || { day: 1, period: 'morning' };
        const lastTickDay = world.last_tick_day ?? 0;
        if (clock.day <= lastTickDay) return res.json({ proposal: null });

        // Update last_tick_day before LLM call to prevent double-tick on concurrent requests
        await writeWorld(dirs, worldId, { ...world, last_tick_day: clock.day });

        const [eventData, characters] = await Promise.all([
            readEvents(dirs, worldId).catch(() => ({ events: [] })),
            listCharacters(dirs, worldId).catch(() => []),
        ]);

        const recentEventSummary = eventData.events.slice(-5)
            .map(e => `${e.title}（${e.impact_scope}）`).join('；');
        const npcList = characters.slice(0, 8)
            .map(c => `${c.name}：${c.current_state?.status || '（状态未知）'}`)
            .join('、');

        const userMessage = [
            `世界：${world.name}`,
            `当前时间：第${clock.day}天·${PERIOD_LABELS[clock.period] || clock.period}`,
            `世界状态：${world.current_state?.summary || '（暂无）'}`,
            npcList ? `主要角色状态：${npcList}` : '',
            recentEventSummary ? `近期事件：${recentEventSummary}` : '',
        ].filter(Boolean).join('\n');

        let raw;
        try {
            raw = await callLLM([{ role: 'user', content: userMessage }], TICK_SYSTEM, apiConfig);
        } catch {
            return res.json({ proposal: null });
        }

        let parsed;
        try { parsed = parseLLMJson(raw); } catch { return res.json({ proposal: null }); }

        if (!parsed.significant || !parsed.title) return res.json({ proposal: null });

        const eventDraft = {
            id: randomUUID(),
            world_id: worldId,
            timestamp: new Date().toISOString(),
            title: parsed.title,
            description: parsed.description || '',
            impact_scope: parsed.impact_scope || 'minor',
            affected_characters: parsed.affected_characters || [],
            confirmed_by_user: false,
            source: 'heartbeat',
        };

        res.json({ proposal: { narrative: parsed.narrative || eventDraft.title, event_draft: eventDraft } });
    } catch (err) {
        console.error('[tick] failed:', err.message);
        res.status(500).json({ error: 'internal_error' });
    }
});
