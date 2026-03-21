// src/endpoints/world-simulation/chat.js
import express from 'express';
import { streamLLM } from './llm-client.js';

export const router = express.Router();

// POST /:worldId — stream chat response as SSE
router.post('/:worldId', async (req, res) => {
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
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    }
    res.end();
});
