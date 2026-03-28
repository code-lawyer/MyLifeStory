// src/endpoints/world-simulation/chat.js
import express from 'express';
import { streamLLM, callLLM } from './llm-client.js';
import { parseLLMJson } from './llm-helpers.js';
import { validateIdParams } from './validate-id.js';

export const router = express.Router();

// POST /:worldId — stream chat response as SSE
router.post('/:worldId', validateIdParams('worldId'), async (req, res) => {
    const { systemPrompt, messages, apiConfig = {} } = req.body;
    if (!systemPrompt || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        await streamLLM(messages, systemPrompt, apiConfig, (delta) => {
            res.write(`data: ${JSON.stringify({ delta })}\n\n`);
            if (typeof res.flush === 'function') res.flush();
        });
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    } catch (err) {
        console.error('[chat] streamLLM failed:', err.message);
        res.write(`data: ${JSON.stringify({ error: err.message || 'LLM request failed' })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    }
    res.end();
});

const NPC_INIT_SYSTEM = `你是世界叙事者。玩家刚刚进入了场景，场景中有一个与玩家关系深厚的NPC主动开口搭话。根据NPC的信息，生成TA此刻说的一句话（中文，30字以内，自然口语，符合语气风格）。只输出那句话，不要解释，不要引号。`;

// POST /:worldId/npc-init — generate opening line for a pre-selected NPC (familiarity >= 70)
router.post('/:worldId/npc-init', validateIdParams('worldId'), async (req, res) => {
    const { scene, character, familiarity, worldState, clock, apiConfig = {} } = req.body;
    if (!scene || !character?.id) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    const periodLabel = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };
    const timeStr = clock ? `第${clock.day}天·${periodLabel[clock.period] || clock.period}` : '';

    const userMessage = [
        `场景：${scene.name} — ${scene.description || ''}`,
        timeStr ? `当前时间：${timeStr}` : '',
        worldState?.summary ? `世界状态：${worldState.summary}` : '',
        `NPC：${character.name}（当前状态：${character.current_state?.status || ''}，语气风格：${character.voice?.style || '中性'}）`,
        `与玩家的熟悉度：${familiarity ?? 70}/100`,
    ].filter(Boolean).join('\n');

    let message;
    try {
        message = (await callLLM([{ role: 'user', content: userMessage }], NPC_INIT_SYSTEM, apiConfig)).trim();
    } catch {
        return res.json({ characterId: null, characterName: null, message: null });
    }

    if (!message) return res.json({ characterId: null, characterName: null, message: null });

    res.json({ characterId: character.id, characterName: character.name, message });
});
