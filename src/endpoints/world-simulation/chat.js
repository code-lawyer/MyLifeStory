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

const NPC_INIT_SYSTEM = `你是世界叙事者。玩家刚刚进入了一个场景，判断是否有NPC应该主动向玩家搭话。
约50%的场合下触发。如果触发，选择最适合开口的NPC，用TA的语气说一句话（中文，30字以内，自然口语，不要解释性文字）。
返回JSON：{"trigger":true,"character_id":"...","character_name":"...","message":"..."}
或：{"trigger":false}
只返回JSON，不要解释。`;

// POST /:worldId/npc-init — NPC may spontaneously speak on scene entry
router.post('/:worldId/npc-init', validateIdParams('worldId'), async (req, res) => {
    const { scene, characters, worldState, clock, apiConfig = {} } = req.body;
    if (!scene || !Array.isArray(characters) || characters.length === 0) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    const periodLabel = { morning: '清晨', afternoon: '午后', evening: '傍晚', night: '深夜' };
    const timeStr = clock ? `第${clock.day}天·${periodLabel[clock.period] || clock.period}` : '';

    const charList = characters.map(c =>
        `- ${c.name}（ID:${c.id}）：${c.current_state?.status || c.identity?.description?.slice(0, 40) || ''}，语气：${c.voice?.style || '中性'}`
    ).join('\n');

    const userMessage = [
        `场景：${scene.name} — ${scene.description || ''}`,
        timeStr ? `当前时间：${timeStr}` : '',
        worldState?.summary ? `世界状态：${worldState.summary}` : '',
        `场景中的角色：\n${charList}`,
    ].filter(Boolean).join('\n');

    let raw;
    try {
        raw = await callLLM([{ role: 'user', content: userMessage }], NPC_INIT_SYSTEM, apiConfig);
    } catch {
        return res.json({ characterId: null, characterName: null, message: null });
    }

    let parsed;
    try { parsed = parseLLMJson(raw); } catch {
        return res.json({ characterId: null, characterName: null, message: null });
    }

    if (!parsed.trigger || !parsed.character_id || !parsed.message) {
        return res.json({ characterId: null, characterName: null, message: null });
    }

    res.json({
        characterId: parsed.character_id,
        characterName: parsed.character_name || '',
        message: parsed.message,
    });
});
