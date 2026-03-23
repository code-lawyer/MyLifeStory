import express from 'express';
import crypto from 'node:crypto';
import { callLLM } from './llm-client.js';
import { DARK_SIDE_SYSTEM } from './prompts.js';

export const router = express.Router();

const WORLD_GEN_SYSTEM = `You are a world-building assistant. Generate a structured world card as JSON with this exact shape:
{"foundation":{"background":"","geography":"","rules":""},"power_system":{"description":"","tiers":[{"level":1,"name":"","description":""}],"constraints":"","notes":""},"current_state":{"summary":""}}
IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON, no other text.`;

const WORLD_REFINE_SYSTEM = (section) => `You are a world-building assistant. The user wants to refine the "${section}" section of their world card. Return the complete updated world card JSON with the same shape as the input. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const CHAR_GEN_SYSTEM = `You are a character creation assistant. Generate a structured character card as JSON with this exact shape:
{"name":"","identity":{"description":"","personality":"","background":""},"power_tier":1,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]}}
Assign a power_tier consistent with the world's power system. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const CHAR_REFINE_SYSTEM = (section) => `You are a character creation assistant. Update only the "${section}" section and return the complete character card JSON. IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const PROTAGONIST_SYSTEM = `You are a world-building assistant. Analyze the protagonist's biography and extract important NPCs mentioned or implied.
Return a JSON object: {"core_npcs":[{"name":"","relationship":"","suggested_tier":"legendary|elite"}]}
Only include characters who are significant to the protagonist's story.
IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

const SCALE_COUNTS = {
    small:  { legendary: 2, elite: 3, normal: 5, disposable: 5, scenes: 6 },
    medium: { legendary: 3, elite: 7, normal: 12, disposable: 8, scenes: 15 },
    large:  { legendary: 5, elite: 15, normal: 30, disposable: 15, scenes: 35 },
};

const NPC_TIER_PROMPTS = {
    legendary: `Generate a LEGENDARY tier NPC with rich detail (~200 chars description, personality, background, 3 example voice lines). Return JSON: {"name":"","identity":{"description":"","personality":"","background":""},"power_tier":0,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]}}`,
    elite: `Generate an ELITE tier NPC with standard detail (~80 chars description, personality, 1 voice line). Return JSON: {"name":"","identity":{"description":"","personality":""},"power_tier":0,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]}}`,
    normal: `Generate a NORMAL tier NPC with brief detail (~30 chars). Return JSON: {"name":"","identity":{"description":""},"current_state":{"relationship_to_player":"neutral"}}`,
    disposable: `Generate a DISPOSABLE tier NPC template (role title, generic description). Return JSON: {"name":"","identity":{"description":""}}`,
};

const SCENE_PROMPT = `Generate a UNIQUE scene/location for this world. The scene name MUST be different from all previously generated scenes. Return JSON: {"name":"","description":"","is_locked":false}`;

function sseWrite(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function stripFences(raw) {
    return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function generate(req, res, systemPrompt, userContent) {
    const { apiConfig = {} } = req.body;
    let raw;
    try { raw = await callLLM([{ role: 'user', content: userContent }], systemPrompt, apiConfig); }
    catch { return res.status(502).json({ error: 'llm_unavailable' }); }

    let draft;
    try { draft = JSON.parse(stripFences(raw)); }
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

// POST /protagonist
router.post('/protagonist', async (req, res) => {
    const { protagonistBio, worldContext, apiConfig = {} } = req.body;
    if (!protagonistBio) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = worldContext ? `\nWorld context: ${JSON.stringify({ foundation: worldContext.foundation, power_system: worldContext.power_system, current_state: worldContext.current_state })}` : '';
    let raw;
    try { raw = await callLLM([{ role: 'user', content: `Protagonist biography:\n${protagonistBio}${worldInfo}` }], PROTAGONIST_SYSTEM, apiConfig); }
    catch { return res.status(502).json({ error: 'llm_unavailable' }); }

    let result;
    try { result = JSON.parse(stripFences(raw)); }
    catch { return res.status(422).json({ error: 'parse_failed', raw }); }

    return res.json(result);
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

// POST /character/refine
router.post('/character/refine', async (req, res) => {
    const { draft, section, instruction } = req.body;
    if (!draft || !section || !instruction) return res.status(400).json({ error: 'missing_fields' });
    const userContent = `Current character card:\n${JSON.stringify(draft)}\n\nRefine the "${section}" section: ${instruction}`;
    await generate(req, res, CHAR_REFINE_SYSTEM(section), userContent);
});

// POST /bulk-npcs (SSE)
router.post('/bulk-npcs', async (req, res) => {
    const { worldId, worldContext, scale = 'small', apiConfig = {} } = req.body;
    if (!worldId || !worldContext) return res.status(400).json({ error: 'missing_fields' });

    const counts = SCALE_COUNTS[scale] || SCALE_COUNTS.small;
    const tiers = ['legendary', 'elite', 'normal', 'disposable'];
    const tasks = tiers.flatMap(tier =>
        Array.from({ length: counts[tier] }, () => tier)
    );
    const total = tasks.length;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.setTimeout(0);

    const summary = { legendary: 0, elite: 0, normal: 0, disposable: 0 };
    let processed = 0;
    let succeeded = 0;
    const collectedNpcs = [];

    const worldSuffix = `\nWorld: ${worldContext.foundation?.background || ''}\nIMPORTANT: Respond in the same language as the world description. Respond only with valid JSON.`;

    for (const tier of tasks) {
        const system = NPC_TIER_PROMPTS[tier] + worldSuffix;
        try {
            const raw = await callLLM([{ role: 'user', content: `Generate one ${tier} NPC for this world.` }], system, apiConfig);
            const npc = JSON.parse(stripFences(raw));
            npc.id = crypto.randomUUID();
            npc.world_id = worldId;
            npc.tier = tier;
            npc.is_core = false;
            npc.is_template = tier === 'disposable';

            if (req.user?.directories?.characters) {
                const { writeCharacter } = await import('./storage/characters.js');
                await writeCharacter(req.user.directories, npc.id, npc);
            }

            collectedNpcs.push(npc);
            processed++;
            succeeded++;
            summary[tier]++;
            sseWrite(res, { type: 'progress', done: processed, total, item: npc });
        } catch (err) {
            processed++;
            sseWrite(res, { type: 'error', done: processed, total, message: err.message || 'generation failed' });
        }
    }

    // Dark-side generation for 20% of legendary/elite NPCs (fire-and-forget)
    const eliteOrAbove = collectedNpcs.filter(n => n.tier === 'legendary' || n.tier === 'elite');
    const darkCount = Math.max(1, Math.round(eliteOrAbove.length * 0.2));
    const shuffled = [...eliteOrAbove].sort(() => Math.random() - 0.5);
    const darkCandidates = shuffled.slice(0, darkCount);

    for (const npc of darkCandidates) {
        // Fire-and-forget: don't await, don't block SSE
        callLLM(
            [{ role: 'user', content: `NPC surface personality:\nName: ${npc.name}\nDescription: ${npc.identity?.description || ''}\nPersonality: ${npc.identity?.personality || ''}` }],
            DARK_SIDE_SYSTEM,
            apiConfig
        ).then(async (raw) => {
            try {
                const ht = JSON.parse(raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim());
                npc.hidden_traits = ht;
                if (req.user?.directories?.characters) {
                    const { writeCharacter } = await import('./storage/characters.js');
                    await writeCharacter(req.user.directories, npc.id, npc);
                }
            } catch { /* skip malformed */ }
        }).catch(() => { /* silent fail */ });
    }

    // Write initial relationship entries for legendary/elite NPCs with familiarity 0
    if (req.user?.directories) {
        try {
            const { readRelationships, writeRelationships } = await import('./storage/relationships.js');
            const relData = await readRelationships(req.user.directories, worldId);
            for (const npc of eliteOrAbove) {
                if (!relData.relationships[npc.id]) {
                    relData.relationships[npc.id] = { familiarity: 0, last_interaction: null };
                }
            }
            await writeRelationships(req.user.directories, worldId, relData);
        } catch { /* ignore */ }
    }

    sseWrite(res, { type: 'done', summary, succeeded, failed: processed - succeeded });
    res.end();
});

// POST /scenes (SSE)
router.post('/scenes', async (req, res) => {
    const { worldId, worldContext, scale = 'small', apiConfig = {}, characters = [] } = req.body;
    if (!worldId || !worldContext) return res.status(400).json({ error: 'missing_fields' });

    const total = (SCALE_COUNTS[scale] || SCALE_COUNTS.small).scenes;
    const charList = characters.map(c => `${c.name} (${c.tier || 'normal'})`).join(', ');

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.setTimeout(0);

    const generatedScenes = [];
    const usedNames = new Set();
    let processed = 0;
    let succeeded = 0;
    const MAX_RETRIES = 2;

    const charHint = charList ? `\nAvailable characters: ${charList}\nAssign 2-5 relevant characters to "characters_present" (use their names). Each character should appear in only 1-2 scenes — distribute them across scenes.` : '';
    const sceneSystem = SCENE_PROMPT + `\nWorld: ${worldContext.foundation?.background || ''}\nGeography: ${worldContext.foundation?.geography || ''}${charHint}\nIMPORTANT: Respond in the same language as the world description. Respond only with valid JSON.`;

    for (let i = 0; i < total; i++) {
        const previousList = [...usedNames].join('、') || '无';
        let scene = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                const raw = await callLLM([{ role: 'user', content: `Generate scene ${i + 1} of ${total}. DO NOT repeat any of these existing scene names: [${previousList}]. Create a completely different location.` }], sceneSystem, apiConfig);
                const parsed = JSON.parse(stripFences(raw));
                if (usedNames.has(parsed.name?.trim())) continue;
                scene = parsed;
                break;
            } catch { /* retry */ }
        }

        processed++;
        if (!scene) {
            sseWrite(res, { type: 'error', done: processed, total, message: 'Failed to generate unique scene' });
            continue;
        }

        usedNames.add(scene.name.trim());

        // Map character names to IDs before emitting
        if (scene.characters_present && characters.length > 0) {
            scene.characters_present = scene.characters_present
                .map(name => characters.find(c => c.name === name)?.id)
                .filter(Boolean);
        }
        scene.id = crypto.randomUUID();
        generatedScenes.push(scene);
        succeeded++;
        sseWrite(res, { type: 'progress', done: processed, total, item: scene });
    }

    if (req.user?.directories?.scenes && generatedScenes.length > 0) {
        const { readScenes, writeScenes } = await import('./storage/scenes.js');
        const existing = await readScenes(req.user.directories, worldId);
        existing.scenes = [...(existing.scenes || []), ...generatedScenes];
        await writeScenes(req.user.directories, worldId, existing);
    }

    sseWrite(res, { type: 'done', summary: { scenes: generatedScenes.length }, succeeded, failed: processed - succeeded });
    res.end();
});
