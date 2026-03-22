import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server;

beforeAll(async () => {
    const { router } = await import('../../src/endpoints/world-simulation/generate.js');
    server = await startTestServer(router, {});
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
