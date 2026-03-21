import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { router } from '../../src/endpoints/world-simulation/index.js';
import { startTestServer } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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
