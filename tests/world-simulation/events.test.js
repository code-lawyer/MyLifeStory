import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { router } from '../../src/endpoints/world-simulation/index.js';
import { startTestServer } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server;

beforeAll(async () => { server = await startTestServer(router); });
afterAll(async () => { await server.stop(); });

describe('GET /health', () => {
    test('returns ok', async () => {
        const res = await fetch(`${server.url}/health`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
    });
});

describe('events CRUD', () => {
    let crudServer;
    let tmpDir;

    beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-events-'));
        fs.mkdirSync(path.join(tmpDir, 'world-events'), { recursive: true });
        const dirs = { worldEvents: path.join(tmpDir, 'world-events') };
        const { router: eventsRouter } = await import('../../src/endpoints/world-simulation/events.js');
        crudServer = await startTestServer(eventsRouter, dirs);
    });

    afterAll(async () => {
        await crudServer.stop();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('GET /:worldId returns empty list initially', async () => {
        const res = await fetch(`${crudServer.url}/world_001`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.events).toEqual([]);
    });

    test('POST /:worldId adds an event', async () => {
        const event = { id: 'e1', title: 'Test', description: 'Desc', impact_scope: 'minor', confirmed_by_user: true };
        const res = await fetch(`${crudServer.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
        });
        expect(res.status).toBe(201);
        const list = await fetch(`${crudServer.url}/world_001`).then(r => r.json());
        expect(list.events).toHaveLength(1);
        expect(list.events[0].id).toBe('e1');
    });

    test('DELETE /:worldId/:eventId removes the event', async () => {
        const res = await fetch(`${crudServer.url}/world_001/e1`, { method: 'DELETE' });
        expect(res.status).toBe(204);
        const list = await fetch(`${crudServer.url}/world_001`).then(r => r.json());
        expect(list.events).toHaveLength(0);
    });
});

describe('POST /events/:worldId/propose', () => {
    let proposeServer;
    let tmpDir2;

    beforeAll(async () => {
        tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-propose-'));
        fs.mkdirSync(path.join(tmpDir2, 'world-events'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir2, 'world-summaries'), { recursive: true });
        const dirs = {
            worldEvents: path.join(tmpDir2, 'world-events'),
            worldSummaries: path.join(tmpDir2, 'world-summaries'),
        };
        const { router: eventsRouter } = await import('../../src/endpoints/world-simulation/events.js');
        proposeServer = await startTestServer(eventsRouter, dirs);
    });

    afterAll(async () => {
        await proposeServer.stop();
        fs.rmSync(tmpDir2, { recursive: true, force: true });
        setLLMAdapter(null);
    });

    test('returns null when LLM finds no significant event', async () => {
        setLLMAdapter(async () => JSON.stringify({ significant: false }));
        const res = await fetch(`${proposeServer.url}/world_001/propose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatHistory: [{ role: 'user', content: 'Hello' }] }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).toBeNull();
    });

    test('returns narrative and event_draft when LLM finds significant event', async () => {
        setLLMAdapter(async () => JSON.stringify({
            significant: true,
            title: 'Great Uprising',
            description: 'Workers revolt.',
            impact_scope: 'major',
            affected_characters: [],
            narrative: '冥冥中，似乎发生了一件足以影响世界的大事……',
        }));
        const res = await fetch(`${proposeServer.url}/world_001/propose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatHistory: [{ role: 'user', content: 'We started the revolt.' }] }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal.narrative).toContain('冥冥中');
        expect(json.proposal.event_draft.title).toBe('Great Uprising');
    });
});

describe('POST /events/:worldId/compress', () => {
    let compressServer;
    let tmpDir3;

    beforeAll(async () => {
        tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-compress-'));
        fs.mkdirSync(path.join(tmpDir3, 'world-events'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir3, 'world-summaries'), { recursive: true });
        const dirs = {
            worldEvents: path.join(tmpDir3, 'world-events'),
            worldSummaries: path.join(tmpDir3, 'world-summaries'),
        };
        const { router: eventsRouter } = await import('../../src/endpoints/world-simulation/events.js');
        compressServer = await startTestServer(eventsRouter, dirs);
    });

    afterAll(async () => {
        await compressServer.stop();
        fs.rmSync(tmpDir3, { recursive: true, force: true });
        setLLMAdapter(null);
    });

    test('compresses oldest non-major events and writes summary', async () => {
        // Seed 25 events (first 20 minor, last 5 major)
        const { appendEvent: append } = await import('../../src/endpoints/world-simulation/storage/events.js');
        const dirs = { worldEvents: path.join(tmpDir3, 'world-events') };
        for (let i = 0; i < 20; i++) {
            await append(dirs, 'world_001', { id: `e${i}`, title: `Event ${i}`, impact_scope: 'minor' });
        }
        for (let i = 20; i < 25; i++) {
            await append(dirs, 'world_001', { id: `e${i}`, title: `Major ${i}`, impact_scope: 'major' });
        }

        setLLMAdapter(async () => 'Early period: 20 minor events occurred.');

        const res = await fetch(`${compressServer.url}/world_001/compress`, { method: 'POST' });
        expect(res.status).toBe(200);

        const { readSummaries } = await import('../../src/endpoints/world-simulation/storage/summaries.js');
        const sumDirs = { worldSummaries: path.join(tmpDir3, 'world-summaries') };
        const summaries = await readSummaries(sumDirs, 'world_001');
        expect(summaries.summaries).toHaveLength(1);
        expect(summaries.summaries[0].summary).toContain('Early period');

        // Major events should remain
        const { readEvents: re } = await import('../../src/endpoints/world-simulation/storage/events.js');
        const remaining = await re(dirs, 'world_001');
        expect(remaining.events.every(e => e.impact_scope === 'major')).toBe(true);
    });
});
