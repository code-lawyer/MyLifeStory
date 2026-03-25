import express from 'express';
import { callLLM } from './llm-client.js';
import { parseLLMJson } from './llm-helpers.js';

export const router = express.Router();

const WORLD_GEN_SYSTEM = `You are a world-building assistant. Generate a structured world card as JSON with this exact shape:
{"foundation":{"background":"","geography":"","rules":""},"power_system":{"description":"","tiers":[{"level":1,"name":"","description":""}],"constraints":"","notes":""},"current_state":{"summary":""}}
IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON, no other text.`;

const WORLD_REFINE_SYSTEM = (section) => `You are a world-building assistant. The user wants to refine the "${section}" section of their world card. Return the complete updated world card JSON with the same shape as the input. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const CHAR_GEN_SYSTEM = `You are a character creation assistant. Generate a structured character card as JSON with this exact shape:
{"name":"","identity":{"description":"","personality":"","background":""},"power_tier":1,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]},"refine_suggestions":{"identity":["suggestion1","suggestion2"],"voice":["suggestion1"],"current_state":["suggestion1"]}}
The refine_suggestions field should contain 2-3 actionable improvement directions per section.
Assign a power_tier consistent with the world's power system. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const CHAR_REFINE_SYSTEM = (section) => `You are a character creation assistant. Update only the "${section}" section and return the complete character card JSON. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const PROTAGONIST_SYSTEM = `You are a world-building assistant. Analyze the protagonist's biography and extract important NPCs mentioned or implied.
Return a JSON object: {"core_npcs":[{"name":"","relationship":"","suggested_tier":"legendary|elite"}]}
Only include characters who are significant to the protagonist's story.
IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const WORLD_NPC_SYSTEM = `You are a world-building assistant. Generate important NPCs that naturally exist in this world but are NOT mentioned in the protagonist's biography.
These should be figures the protagonist would encounter based on the world setting — rivals, authorities, mysterious figures, merchants, etc.
Return a JSON object: {"world_npcs":[{"name":"","relationship":"","suggested_tier":"legendary|elite"}]}
IMPORTANT: Do NOT include any characters already mentioned or implied in the protagonist bio. Respond in the same language as the user's input. Respond only with valid JSON.`;

const SUGGEST_REFINE_SYSTEM = `You are a character design advisor. Analyze the given section of a character card and suggest 3-4 specific ways to improve or enrich it.
Return JSON: {"suggestions":["suggestion 1","suggestion 2","suggestion 3"]}
Each suggestion should be a concrete, actionable direction (e.g., "Add a childhood trauma that explains their distrust of authority").
IMPORTANT: Respond in the same language as the character card. Respond only with valid JSON.`;

async function callAndParse(req, res, systemPrompt, userContent) {
    const { apiConfig = {} } = req.body;
    let raw;
    try { raw = await callLLM([{ role: 'user', content: userContent }], systemPrompt, apiConfig); }
    catch { res.status(502).json({ error: 'llm_unavailable' }); return null; }

    try { return parseLLMJson(raw); }
    catch { res.status(422).json({ error: 'parse_failed' }); return null; }
}

async function generate(req, res, systemPrompt, userContent) {
    const draft = await callAndParse(req, res, systemPrompt, userContent);
    if (draft !== null) res.json({ draft });
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

// POST /protagonist
router.post('/protagonist', async (req, res) => {
    const { protagonistBio, worldContext } = req.body;
    if (!protagonistBio) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = worldContext ? `\nWorld context: ${JSON.stringify({ foundation: worldContext.foundation, power_system: worldContext.power_system, current_state: worldContext.current_state })}` : '';
    const result = await callAndParse(req, res, PROTAGONIST_SYSTEM, `Protagonist biography:\n${protagonistBio}${worldInfo}`);
    if (result !== null) res.json(result);
});

// POST /world-npcs
router.post('/world-npcs', async (req, res) => {
    const { worldContext, protagonistBio, count = 3 } = req.body;
    if (!worldContext) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = JSON.stringify({ foundation: worldContext.foundation, power_system: worldContext.power_system });
    const bioContext = protagonistBio ? `\nProtagonist biography (DO NOT generate these characters):\n${protagonistBio}` : '';
    const result = await callAndParse(req, res, WORLD_NPC_SYSTEM, `World context:\n${worldInfo}${bioContext}\n\nGenerate ${count} important world NPCs.`);
    if (result !== null) res.json(result);
});

// POST /character/suggest-refine — MUST be before /character to avoid route ambiguity
router.post('/character/suggest-refine', async (req, res) => {
    const { draft, section } = req.body;
    if (!draft || !section) return res.status(400).json({ error: 'missing_fields' });
    const result = await callAndParse(req, res, SUGGEST_REFINE_SYSTEM, `Character card:\n${JSON.stringify(draft)}\n\nAnalyze the "${section}" section and suggest improvements.`);
    if (result !== null) res.json(result);
});

// POST /character/refine
router.post('/character/refine', async (req, res) => {
    const { draft, section, instruction } = req.body;
    if (!draft || !section || !instruction) return res.status(400).json({ error: 'missing_fields' });
    const userContent = `Current character card:\n${JSON.stringify(draft)}\n\nRefine the "${section}" section: ${instruction}`;
    await generate(req, res, CHAR_REFINE_SYSTEM(section), userContent);
});

// POST /character
router.post('/character', async (req, res) => {
    const { description, worldContext, tier, relationship, protagonistBio } = req.body;
    if (!description) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = worldContext ? `\nWorld context: ${JSON.stringify({ foundation: worldContext.foundation, power_system: worldContext.power_system })}` : '';
    const protaInfo = protagonistBio ? `\nProtagonist bio: ${protagonistBio}` : '';
    const tierHint = tier ? `\nCharacter tier: ${tier}. Adjust detail level accordingly (legendary=very detailed, elite=standard, normal=brief, disposable=minimal).` : '';
    const relHint = relationship ? `\nRelationship to protagonist: ${relationship}` : '';
    const system = CHAR_GEN_SYSTEM + tierHint + relHint;
    await generate(req, res, system, `Create a character based on this description: ${description}${worldInfo}${protaInfo}`);
});
