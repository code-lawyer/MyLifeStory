import express from 'express';
import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server;

beforeAll(async () => {
    const { router: worldRouter } = await import('../../src/endpoints/world-simulation/generate-world.js');
    const { router: bulkRouter } = await import('../../src/endpoints/world-simulation/generate-bulk.js');
    const combined = express.Router();
    combined.use(worldRouter);
    combined.use(bulkRouter);
    server = await startTestServer(combined, {});
});

afterAll(async () => {
    await server.stop();
    setLLMAdapter(null);
});

afterEach(() => setLLMAdapter(null));

const WORLD_DRAFT = {
    foundation: { background: 'Steampunk city', geography: 'Floating islands', rules: 'Magic suppressed' },
    power_system: { description: 'Mechanical tiers', tiers: [], constraints: '' },
    current_state: { summary: 'City is stable' },
};

describe('POST /generate/world', () => {
    test('returns a structured world card draft', async () => {
        setLLMAdapter(async () => JSON.stringify(WORLD_DRAFT));
        const res = await fetch(`${server.url}/world`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'A steampunk city with floating islands' }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.draft.foundation.background).toBe('Steampunk city');
    });

    test('returns 502 on LLM failure', async () => {
        setLLMAdapter(async () => { throw new Error('LLM down'); });
        const res = await fetch(`${server.url}/world`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'test' }),
        });
        expect(res.status).toBe(502);
    });
});

describe('POST /generate/world/refine', () => {
    test('returns refined draft with updated section', async () => {
        const refined = { ...WORLD_DRAFT, foundation: { ...WORLD_DRAFT.foundation, background: 'Dark steampunk city' } };
        setLLMAdapter(async () => JSON.stringify(refined));
        const res = await fetch(`${server.url}/world/refine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft: WORLD_DRAFT, section: 'foundation', instruction: 'Make it darker' }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.draft.foundation.background).toBe('Dark steampunk city');
    });
});

const CHAR_DRAFT = {
    name: 'Ada Walker',
    identity: { description: 'Tall woman with mechanical arm', personality: 'Stubborn and clever', background: 'Self-taught engineer' },
    power_tier: 2,
    current_state: { relationship_to_player: 'neutral', status: 'working in her workshop' },
    voice: { style: 'Direct and technical', example_lines: ['Gears never lie.'] },
};

describe('POST /generate/character', () => {
    test('returns a structured character card draft', async () => {
        setLLMAdapter(async () => JSON.stringify(CHAR_DRAFT));
        const res = await fetch(`${server.url}/character`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'A female engineer with a mechanical arm', worldContext: { power_system: { tiers: [] } } }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.draft.name).toBe('Ada Walker');
        expect(json.draft.power_tier).toBe(2);
    });
});

describe('POST /generate/character with tier and relationship', () => {
    test('passes tier and relationship to system prompt', async () => {
        let capturedSystem;
        setLLMAdapter(async (msgs, system) => {
            capturedSystem = system;
            return JSON.stringify(CHAR_DRAFT);
        });
        const res = await fetch(`${server.url}/character`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: 'A powerful wizard',
                worldContext: { power_system: { tiers: [] } },
                tier: 'legendary',
                relationship: '主角的导师',
            }),
        });
        expect(res.status).toBe(200);
        expect(capturedSystem).toContain('legendary');
        expect(capturedSystem).toContain('主角的导师');
    });
});

describe('POST /generate/protagonist', () => {
    test('extracts core NPCs from protagonist bio', async () => {
        const mockResponse = {
            core_npcs: [
                { name: 'Mentor', relationship: 'teacher', suggested_tier: 'legendary' },
                { name: 'Rival', relationship: 'enemy', suggested_tier: 'elite' },
            ],
        };
        setLLMAdapter(async () => JSON.stringify(mockResponse));
        const res = await fetch(`${server.url}/protagonist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                protagonistBio: 'I was trained by a great mentor, but my rival always challenged me.',
                worldContext: WORLD_DRAFT,
            }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.core_npcs).toHaveLength(2);
        expect(json.core_npcs[0].name).toBe('Mentor');
    });

    test('returns 400 without bio', async () => {
        const res = await fetch(`${server.url}/protagonist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /generate/bulk-npcs', () => {
    test('streams NPC generation progress via SSE', async () => {
        let callCount = 0;
        setLLMAdapter(async () => {
            callCount++;
            return JSON.stringify({
                name: `NPC-${callCount}`,
                identity: { description: 'A character' },
                power_tier: 1,
                current_state: { relationship_to_player: 'neutral', status: 'idle' },
                voice: { style: 'calm', example_lines: [] },
            });
        });

        const res = await fetch(`${server.url}/bulk-npcs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                worldId: 'test-world-bulk',
                worldContext: WORLD_DRAFT,
                scale: 'small',
            }),
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.startsWith('data: '));
        const events = lines.map(l => JSON.parse(l.slice(6)));
        const doneEvent = events.find(e => e.type === 'done');
        expect(doneEvent).toBeDefined();
        expect(doneEvent.summary).toBeDefined();
    });
});

describe('POST /generate/scenes', () => {
    test('streams scene generation progress via SSE', async () => {
        let callCount = 0;
        setLLMAdapter(async () => {
            callCount++;
            return JSON.stringify({
                name: `Scene-${callCount}`,
                description: 'A place',
                is_locked: false,
            });
        });

        const res = await fetch(`${server.url}/scenes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                worldId: 'test-world-scenes',
                worldContext: WORLD_DRAFT,
                scale: 'small',
            }),
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.startsWith('data: '));
        const events = lines.map(l => JSON.parse(l.slice(6)));
        const doneEvent = events.find(e => e.type === 'done');
        expect(doneEvent).toBeDefined();
    });
});
