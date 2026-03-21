import express from 'express';
export const router = express.Router();

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

// POST /build
router.post('/build', (req, res) => {
    const { worldCard, eventLog, archivedSummaries, characters, activeCharacters,
            currentScene, playerStatus, chatHistory, tokenBudget, mode } = req.body;

    if (!worldCard || !chatHistory || !tokenBudget || !mode) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    const budget = BUDGETS[mode] || BUDGETS.intimate;
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
    const sceneText = currentScene ? `# Current Location: ${currentScene.name}\n${currentScene.description || ''}` : '';

    // Build player section
    const playerChars = Math.floor(totalChars * budget.player);
    const playerText = playerStatus ? `# Player Status\n${JSON.stringify(playerStatus)}` : '';

    // Build chat history (remaining budget)
    const chatChars = Math.floor(totalChars * budget.chat);
    let chatUsed = 0;
    const trimmedChatHistory = [];
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        const msg = chatHistory[i];
        const len = (msg.content || '').length;
        if (chatUsed + len > chatChars) break;
        trimmedChatHistory.unshift(msg);
        chatUsed += len;
    }

    const systemPrompt = [
        truncate(worldBaseText, worldBaseChars),
        truncate(sceneText, sceneChars),
        truncate(playerText, playerChars),
        truncate(fullEventsText, eventsChars),
        truncate(`# Characters\n${charsText}`, charBudgetChars),
    ].filter(Boolean).join('\n\n---\n\n');

    res.json({ systemPrompt, trimmedChatHistory, mode });
});
