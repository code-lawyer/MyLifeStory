import express from 'express';
import { callLLM } from './llm-client.js';

export const router = express.Router();

const WORLD_GEN_SYSTEM = `You are a world-building assistant. Generate a structured world card as JSON with this exact shape:
{"foundation":{"background":"","geography":"","rules":""},"power_system":{"description":"","tiers":[{"level":1,"name":"","description":""}],"constraints":"","notes":""},"current_state":{"summary":""}}
IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON, no other text.`;

const WORLD_REFINE_SYSTEM = (section) => `You are a world-building assistant. The user wants to refine the "${section}" section of their world card. Return the complete updated world card JSON with the same shape as the input. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const CHAR_GEN_SYSTEM = `You are a character creation assistant. Generate a structured character card as JSON with this exact shape:
{"name":"","identity":{"description":"","personality":"","background":""},"power_tier":1,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]}}
Assign a power_tier consistent with the world's power system. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const CHAR_REFINE_SYSTEM = (section) => `You are a character creation assistant. Update only the "${section}" section and return the complete character card JSON. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

async function generate(req, res, systemPrompt, userContent) {
    const { apiConfig = {} } = req.body;
    let raw;
    try { raw = await callLLM([{ role: 'user', content: userContent }], systemPrompt, apiConfig); }
    catch { return res.status(502).json({ error: 'llm_unavailable' }); }

    let draft;
    try {
        // Strip markdown code fences if the model wrapped the JSON
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        draft = JSON.parse(cleaned);
    }
    catch { return res.status(422).json({ error: 'parse_failed', raw }); }

    return res.json({ draft });
}

// POST /world/refine — must be registered before /world to avoid ambiguity
router.post('/world/refine', async (req, res) => {
    const { draft, section, instruction } = req.body;
    if (!draft || !section || !instruction) return res.status(400).json({ error: 'missing_fields' });
    const userContent = `Current world card:\n${JSON.stringify(draft)}\n\nRefine the "${section}" section with this instruction: ${instruction}`;
    await generate(req, res, WORLD_REFINE_SYSTEM(section), userContent);
});

// POST /world
router.post('/world', async (req, res) => {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'missing_fields' });
    await generate(req, res, WORLD_GEN_SYSTEM, `Create a world based on this description: ${description}`);
});

// POST /character
router.post('/character', async (req, res) => {
    const { description, worldContext, tier, relationship } = req.body;
    if (!description) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = worldContext ? `\nWorld power system: ${JSON.stringify(worldContext.power_system)}` : '';
    const tierHint = tier ? `\nCharacter tier: ${tier}. Adjust detail level accordingly (legendary=very detailed, elite=standard, normal=brief, disposable=minimal).` : '';
    const relHint = relationship ? `\nRelationship to protagonist: ${relationship}` : '';
    const system = CHAR_GEN_SYSTEM + tierHint + relHint;
    await generate(req, res, system, `Create a character based on this description: ${description}${worldInfo}`);
});

// POST /character/refine
router.post('/character/refine', async (req, res) => {
    const { draft, section, instruction } = req.body;
    if (!draft || !section || !instruction) return res.status(400).json({ error: 'missing_fields' });
    const userContent = `Current character card:\n${JSON.stringify(draft)}\n\nRefine the "${section}" section: ${instruction}`;
    await generate(req, res, CHAR_REFINE_SYSTEM(section), userContent);
});
