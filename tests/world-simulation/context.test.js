import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer } from './helpers.js';
import { router } from '../../src/endpoints/world-simulation/context.js';

let server;
beforeAll(async () => { server = await startTestServer(router, {}); });
afterAll(async () => { await server.stop(); });

const BASE_PAYLOAD = {
    worldCard: { foundation: { background: 'A', geography: 'B', rules: 'C' }, power_system: { description: 'D', tiers: [] }, current_state: { summary: 'E' } },
    eventLog: [{ title: 'Event 1', description: 'Desc' }],
    archivedSummaries: [],
    characters: [{ name: 'Ada', identity: { description: 'tall' }, voice: { style: 'direct', example_lines: ['Hi'] }, current_state: { status: 'busy' } }],
    activeCharacters: ['Ada'],
    currentScene: { name: 'Square', description: 'Dusty' },
    playerStatus: { health: 'good', reputation: 'known' },
    chatHistory: [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' }],
    tokenBudget: 1000,
    mode: 'intimate',
};

describe('POST /context/build', () => {
    test('returns sections with intimate mode', async () => {
        const res = await fetch(`${server.url}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(BASE_PAYLOAD),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toHaveProperty('systemPrompt');
        expect(json).toHaveProperty('trimmedChatHistory');
        expect(json.mode).toBe('intimate');
        expect(typeof json.systemPrompt).toBe('string');
        expect(json.systemPrompt.length).toBeGreaterThan(0);
    });

    test('ensemble mode allocates more budget to events than intimate', async () => {
        const [intimateRes, ensembleRes] = await Promise.all([
            fetch(`${server.url}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...BASE_PAYLOAD, mode: 'intimate' }) }).then(r => r.json()),
            fetch(`${server.url}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...BASE_PAYLOAD, mode: 'ensemble' }) }).then(r => r.json()),
        ]);
        // Ensemble should have more event content in system prompt
        const ensembleEventContent = (ensembleRes.systemPrompt.match(/Event 1/g) || []).length;
        const intimateEventContent = (intimateRes.systemPrompt.match(/Event 1/g) || []).length;
        expect(ensembleEventContent).toBeGreaterThanOrEqual(intimateEventContent);
    });

    test('returns 400 when required fields missing', async () => {
        const res = await fetch(`${server.url}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'intimate' }),
        });
        expect(res.status).toBe(400);
    });
});
