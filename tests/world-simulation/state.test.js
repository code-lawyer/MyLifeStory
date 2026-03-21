import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server, tmpDir, dirs;

beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-state-'));
    ['world-events', 'world-summaries', 'worlds'].forEach(d =>
        fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = {
        worldEvents: path.join(tmpDir, 'world-events'),
        worldSummaries: path.join(tmpDir, 'world-summaries'),
        worlds: path.join(tmpDir, 'worlds'),
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
        fs.writeFileSync(path.join(dirs.worlds, 'w1.json'), JSON.stringify(worldData));

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
});
