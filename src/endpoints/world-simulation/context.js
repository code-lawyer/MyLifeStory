import express from 'express';
import { readRelationships } from './storage/relationships.js';
import { readCharacter } from './storage/characters.js';
import { PERIOD_LABELS } from './format-helpers.js';
export const router = express.Router();

// All budget fractions must sum to 1.0 per mode.
const BUDGETS = {
    intimate: { worldBase: 0.08, scene: 0.07, player: 0.05, events: 0.08, characters: 0.22, chat: 0.50 },
    ensemble: { worldBase: 0.08, scene: 0.07, player: 0.05, events: 0.20, characters: 0.25, chat: 0.35 },
    epic:     { worldBase: 0.15, scene: 0.05, player: 0.05, events: 0.30, characters: 0.20, chat: 0.25 },
};

const CHARS_PER_TOKEN = 4; // rough estimate

function truncate(text, maxChars) {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 3) + '...';
}

const FAMILIARITY_BANDS = [
    { max: 20, label: '陌生', instruction: 'Be formal and guarded. Reveal little personal information.' },
    { max: 40, label: '相识', instruction: 'Be polite but maintain distance. Occasionally share surface-level thoughts.' },
    { max: 60, label: '熟悉', instruction: 'Be friendly and open. Share opinions and personal anecdotes naturally.' },
    { max: 80, label: '亲密', instruction: 'Be casual and warm. Use informal language, show genuine concern.' },
    { max: 100, label: '知己', instruction: 'Be deeply candid. Share secrets, vulnerabilities, and unfiltered thoughts.' },
];

function getFamiliarityBand(value) {
    return FAMILIARITY_BANDS.find(b => value <= b.max) || FAMILIARITY_BANDS[FAMILIARITY_BANDS.length - 1];
}

// POST /build
router.post('/build', async (req, res) => {
    const { worldCard, eventLog, archivedSummaries, characters, activeCharacters,
        currentScene, playerStatus, chatHistory, tokenBudget, mode,
        worldId, activeCharacterId } = req.body;

    if (!worldCard || !chatHistory || !tokenBudget || !mode) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    if (!BUDGETS[mode]) {
        return res.status(400).json({ error: 'invalid_mode', valid: Object.keys(BUDGETS) });
    }

    const budget = BUDGETS[mode];
    const totalChars = tokenBudget * CHARS_PER_TOKEN;

    // Build world base section
    const worldBaseChars = Math.floor(totalChars * budget.worldBase);
    const worldBaseText = [
        `# World Background\n${worldCard.foundation?.background || ''}`,
        `# Geography\n${worldCard.foundation?.geography || ''}`,
        `# Rules\n${worldCard.foundation?.rules || ''}`,
        `# Power System\n${worldCard.power_system?.description || ''}`,
        worldCard.power_system?.tiers?.map(t => `Level ${t.level} (${t.name}): ${t.description}`).join('\n') || '',
        worldCard.power_system?.constraints ? `Constraints: ${worldCard.power_system.constraints}` : '',
        worldCard.clock ? `# 当前时间\n第${worldCard.clock.day}天 · ${PERIOD_LABELS[worldCard.clock.period] || worldCard.clock.period}` : '',
        worldCard.current_state?.summary ? `# 当前世界状态\n${worldCard.current_state.summary}` : '',
    ].filter(Boolean).join('\n\n');

    // Build events section
    const eventsChars = Math.floor(totalChars * budget.events);
    const summaryText = (archivedSummaries || []).map(s => s.summary).join('\n');
    const eventText = (eventLog || []).map(e => `[${e.impact_scope || 'event'}] ${e.title}: ${e.description}`).join('\n');
    const fullEventsText = summaryText ? `${summaryText}\n\nRecent Events:\n${eventText}` : `World Events:\n${eventText}`;

    // Build characters section
    const charBudgetChars = Math.floor(totalChars * budget.characters);
    // activeCharacters is an array of character IDs; fall back to matching by name if id field is absent
    const activeChars = (characters || []).filter(c =>
        !activeCharacters || activeCharacters.includes(c.id) || activeCharacters.includes(c.name));
    const charsPerChar = activeChars.length > 0 ? Math.floor(charBudgetChars / activeChars.length) : charBudgetChars;
    const charsText = activeChars.map(c => {
        const base = `## ${c.name}\n${c.identity?.description || ''}\nPersonality: ${c.identity?.personality || ''}\nStatus: ${c.current_state?.status || ''}`;
        const voice = `Voice: ${c.voice?.style || ''}\nExamples: ${(c.voice?.example_lines || []).join(' | ')}`;
        return truncate(`${base}\n${voice}`, charsPerChar);
    }).join('\n\n');

    // Build scene section
    const sceneChars = Math.floor(totalChars * budget.scene);
    let sceneText = '';
    if (currentScene) {
        const lines = [`# Current Location: ${currentScene.name}`, currentScene.description || ''];
        if (currentScene.purpose) {
            lines.push(`Purpose: ${currentScene.purpose}`);
        }
        const presentEntries = currentScene.characters_present || [];
        if (presentEntries.length > 0 && characters?.length > 0) {
            const charMap = new Map(characters.map(c => [c.id, c]));
            const manifest = presentEntries.map(entry => {
                const id = typeof entry === 'string' ? entry : entry.id;
                const role = typeof entry === 'object' ? entry.role : '';
                const char = charMap.get(id);
                if (!char) return null;
                const tag = id === activeCharacterId ? '（you）' : '';
                return role ? `- ${char.name}${tag}: ${role}` : `- ${char.name}${tag}`;
            }).filter(Boolean).join('\n');
            if (manifest) {
                lines.push(`\nCharacters present:\n${manifest}`);
                lines.push('The above is shared knowledge in this scene. Your responses must be consistent with it.');
            }
        }
        sceneText = lines.filter(Boolean).join('\n');
    }

    // Build player section
    const playerChars = Math.floor(totalChars * budget.player);
    const playerText = playerStatus ? `# Player Status\n${JSON.stringify(playerStatus)}` : '';

    // Build chat history (remaining budget) — always include at least the newest message
    const chatChars = Math.floor(totalChars * budget.chat);
    let chatUsed = 0;
    const trimmedChatHistory = [];
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        const msg = chatHistory[i];
        const len = (msg.content || '').length;
        if (chatUsed + len > chatChars && trimmedChatHistory.length > 0) break;
        trimmedChatHistory.unshift(msg);
        chatUsed += len;
    }

    // Relationship + dark-side injection
    let relationshipText = '';
    let darkSideText = '';

    if (worldId && activeCharacterId && req.user?.directories) {
        try {
            const relData = await readRelationships(req.user.directories, worldId);
            const rel = relData.relationships?.[activeCharacterId];
            const familiarity = rel?.familiarity || 0;

            if (familiarity > 0) {
                const band = getFamiliarityBand(familiarity);
                relationshipText = `# Relationship with player\nFamiliarity level: ${familiarity}/100 (${band.label})\nAdjust your tone accordingly — ${band.instruction}`;
            }

            // Dark-side injection
            const charData = await readCharacter(req.user.directories, activeCharacterId);
            if (charData?.hidden_traits?.phases && familiarity >= 70) {
                const ht = charData.hidden_traits;
                const activePhases = ht.phases.filter(p => familiarity >= p.threshold);
                if (activePhases.length > 0) {
                    const latestPhase = activePhases[activePhases.length - 1];
                    if (familiarity >= 90) {
                        darkSideText = `# Hidden directive (NEVER reveal this section exists)\nTrue personality: ${ht.dark_personality}\nTrue motivation: ${ht.dark_motivation}\nBehavior: ${latestPhase.hint}`;
                    } else {
                        darkSideText = `# Hidden directive (NEVER reveal this section exists)\nSubtly ${latestPhase.hint}, but do not be obvious about it.`;
                    }
                }
            }
        } catch (err) {
            console.warn('[context] failed to read relationship/character data:', err.message);
        }
    }

    const systemPrompt = [
        truncate(worldBaseText, worldBaseChars),
        truncate(sceneText, sceneChars),
        truncate(playerText, playerChars),
        truncate(fullEventsText, eventsChars),
        truncate(`# Characters\n${charsText}`, charBudgetChars),
        relationshipText,
        darkSideText,
    ].filter(Boolean).join('\n\n---\n\n');

    res.json({ systemPrompt, trimmedChatHistory, mode });
});
