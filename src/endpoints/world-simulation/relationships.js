import express from 'express';
import { readRelationships, writeRelationships } from './storage/relationships.js';
import { readCharacter } from './storage/characters.js';
import { callLLMForJson, LLMError } from './llm-helpers.js';
import { fmtEvent } from './format-helpers.js';
import { validateIdParams, isValidId } from './validate-id.js';

export const router = express.Router();
const vId = validateIdParams('worldId');
const vIds = validateIdParams('worldId', 'charId');

const EVALUATE_SYSTEM = `You are a relationship analyst for a narrative world simulation. Given recent dialogue between a player and an NPC, evaluate how much the interaction deepened their relationship.
Return JSON: {"delta": <0-5>, "reason": "<brief explanation>"}
Guidelines:
- No meaningful exchange or purely functional interaction: delta 0
- Casual greetings or short exchanges: delta 1
- Sharing personal opinions or experiences: delta 2-3
- Deep emotional exchanges, secrets shared, conflicts resolved: delta 4-5
IMPORTANT: Respond only with valid JSON.`;

// GET /:worldId — return all relationships with computed dark_revealed
router.get('/:worldId', vId, async (req, res) => {
    try {
        const dirs = req.user.directories;
        const data = await readRelationships(dirs, req.params.worldId);
        const result = { relationships: {} };

        for (const [charId, rel] of Object.entries(data.relationships || {})) {
            const entry = { ...rel, dark_revealed: false };
            if (rel.familiarity >= 90) {
                try {
                    const char = await readCharacter(dirs, charId);
                    if (char?.hidden_traits) {
                        entry.dark_revealed = true;
                        entry.dark_personality = char.hidden_traits.dark_personality;
                        entry.dark_motivation = char.hidden_traits.dark_motivation;
                    }
                } catch { /* character may not exist */ }
            }
            result.relationships[charId] = entry;
        }
        res.json(result);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST /:worldId/:charId/evaluate — evaluate familiarity delta from recent chat
router.post('/:worldId/:charId/evaluate', vIds, async (req, res) => {
    try {
        const { messages, apiConfig = {} } = req.body;
        if (!Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'missing_messages' });
        }

        // Read stored familiarity — backend owns the state, don't trust client value
        const dirs = req.user.directories;
        const data = await readRelationships(dirs, req.params.worldId);
        const currentFamiliarity = data.relationships?.[req.params.charId]?.familiarity || 0;

        const chatSnippet = messages.map(m => `${m.role}: ${m.content}`).join('\n');
        let parsed;
        try {
            parsed = await callLLMForJson(
                [{ role: 'user', content: `Current familiarity: ${currentFamiliarity}/100\n\nRecent dialogue:\n${chatSnippet}` }],
                EVALUATE_SYSTEM,
                apiConfig,
            );
        } catch (err) {
            if (err instanceof LLMError) {
                return res.json({ familiarity: currentFamiliarity, delta: 0, reason: 'llm_unavailable' });
            }
            throw err;
        }

        const delta = Math.max(0, Math.min(5, parseInt(parsed.delta) || 0));
        const newFamiliarity = Math.min(100, currentFamiliarity + delta);

        if (!data.relationships) data.relationships = {};
        data.relationships[req.params.charId] = {
            ...(data.relationships[req.params.charId] || {}),
            familiarity: newFamiliarity,
            last_interaction: new Date().toISOString(),
        };
        await writeRelationships(dirs, req.params.worldId, data);

        res.json({ familiarity: newFamiliarity, delta, reason: parsed.reason || '' });
    } catch (err) {
        console.error('[relationships] evaluate failed:', err.message);
        res.status(500).json({ error: 'internal_error' });
    }
});

const EVENT_DRIFT_SYSTEM = `你是关系分析师。根据事件，判断玩家与该角色的熟悉度变化。
返回JSON：{"delta": N}，N为-5到5的整数。正数表示关系改善，负数表示关系恶化。
只输出JSON，不要解释。`;

const MAX_DRIFT_CHARS = 5;

router.post('/:worldId/event-drift', vId, async (req, res) => {
    try {
        const { event, affectedCharIds, apiConfig = {} } = req.body;
        if (!event?.title || !Array.isArray(affectedCharIds) || affectedCharIds.length === 0) {
            return res.status(400).json({ error: 'missing_fields' });
        }

        const targetIds = affectedCharIds
            .filter(id => id !== '__player__')
            .filter(isValidId)
            .slice(0, MAX_DRIFT_CHARS);

        if (targetIds.length === 0) return res.json({ updated: [] });

        const dirs = req.user.directories;
        const data = await readRelationships(dirs, req.params.worldId);

        const results = await Promise.all(targetIds.map(async (charId) => {
            try {
                const currentFamiliarity = data.relationships?.[charId]?.familiarity ?? 0;
                const userMessage = [
                    `角色ID：${charId}`,
                    `当前熟悉度：${currentFamiliarity}/100`,
                    fmtEvent(event),
                ].join('\n');

                const parsed = await callLLMForJson([{ role: 'user', content: userMessage }], EVENT_DRIFT_SYSTEM, apiConfig);
                const delta = Math.max(-5, Math.min(5, parseInt(parsed?.delta) || 0));
                const newFamiliarity = Math.max(0, Math.min(100, currentFamiliarity + delta));
                return { charId, familiarity: newFamiliarity, delta, prev: data.relationships?.[charId] || {} };
            } catch (err) {
                if (err instanceof LLMError) return null;
                throw err;
            }
        }));

        const succeeded = results.filter(Boolean);

        if (succeeded.length > 0) {
            if (!data.relationships) data.relationships = {};
            for (const { charId, familiarity, prev } of succeeded) {
                data.relationships[charId] = { ...prev, familiarity, last_interaction: new Date().toISOString() };
            }
            await writeRelationships(dirs, req.params.worldId, data);
        }

        res.json({ updated: succeeded.map(({ charId, familiarity, delta }) => ({ charId, familiarity, delta })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
