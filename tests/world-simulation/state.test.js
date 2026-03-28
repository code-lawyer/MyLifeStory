import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server, tmpDir, dirs;

beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-state-'));
    ['world-events', 'world-summaries', 'worlds', 'characters'].forEach(d =>
        fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = {
        worldEvents: path.join(tmpDir, 'world-events'),
        worldSummaries: path.join(tmpDir, 'world-summaries'),
        worlds: path.join(tmpDir, 'worlds'),
        characters: path.join(tmpDir, 'characters'),
    };
    const { router } = await import('../../src/endpoints/world-simulation/state.js');
    server = await startTestServer(router, dirs);
});

afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setLLMAdapter(null);
});

describe('GET /state/:worldId', () => {
    test('returns 404 when world file does not exist', async () => {
        const res = await fetch(`${server.url}/nonexistent`);
        expect(res.status).toBe(404);
    });
});

describe('POST /state/:worldId/update', () => {
    beforeEach(() => setLLMAdapter(null));

    test('calls LLM and updates current_state in world file', async () => {
        // Create a world file first
        const worldData = { id: 'w1', name: 'Test World', current_state: { summary: 'Old summary', updated_at: '' } };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_w1.json'), JSON.stringify(worldData));

        setLLMAdapter(async () => 'New summary: the world has changed.');

        const res = await fetch(`${server.url}/w1/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.current_state.summary).toContain('New summary');
    });

    test('returns 502 when LLM is unavailable', async () => {
        // Ensure world file exists (reuse w1.json from previous test)
        const worldData = { id: 'w1', name: 'Test World', current_state: { summary: 'Old', updated_at: '' } };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_w1.json'), JSON.stringify(worldData));

        setLLMAdapter(async () => { throw new Error('LLM down'); });

        const res = await fetch(`${server.url}/w1/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(502);
    });
});

describe('POST /state/:worldId/tick', () => {
    beforeEach(() => setLLMAdapter(null));

    test('returns null when clock.day <= last_tick_day', async () => {
        const worldData = { id: 'tk1', name: 'Tick World', clock: { day: 2, period: 'morning' }, last_tick_day: 2 };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_tk1.json'), JSON.stringify(worldData));

        const res = await fetch(`${server.url}/tk1/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).toBeNull();
    });

    test('returns proposal when LLM generates a significant event', async () => {
        const worldData = { id: 'tk2', name: 'Tick World', clock: { day: 3, period: 'morning' }, last_tick_day: 2 };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_tk2.json'), JSON.stringify(worldData));

        setLLMAdapter(async () => JSON.stringify({
            significant: true,
            title: 'Market Collapse',
            description: 'The grain market collapsed overnight.',
            impact_scope: 'moderate',
            affected_characters: [],
            narrative: '不知何时起，市场上的粮食价格急剧攀升……',
        }));

        const res = await fetch(`${server.url}/tk2/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).not.toBeNull();
        expect(json.proposal.event_draft.title).toBe('Market Collapse');
        expect(json.proposal.event_draft.source).toBe('heartbeat');
        expect(json.proposal.narrative).toContain('不知何时');
    });

    test('returns null when LLM returns significant:false', async () => {
        const worldData = { id: 'tk3', name: 'Tick World', clock: { day: 4, period: 'morning' }, last_tick_day: 3 };
        fs.writeFileSync(path.join(dirs.worlds, 'ws_tk3.json'), JSON.stringify(worldData));

        setLLMAdapter(async () => JSON.stringify({ significant: false }));

        const res = await fetch(`${server.url}/tk3/tick`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).toBeNull();
    });
});
