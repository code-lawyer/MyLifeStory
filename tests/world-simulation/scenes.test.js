import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer } from './helpers.js';

let server, tmpDir, dirs;

beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-scenes-'));
    ['scenes', 'players'].forEach(d => fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = { scenes: path.join(tmpDir, 'scenes'), players: path.join(tmpDir, 'players') };
    const { router } = await import('../../src/endpoints/world-simulation/scenes.js');
    server = await startTestServer(router, dirs);
});

afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SCENE = { id: 's1', name: 'South Square', description: 'Dusty square', accessible_from: [], characters_present: [], is_locked: false };

describe('scenes endpoints', () => {
    test('GET /:worldId returns empty list', async () => {
        const res = await fetch(`${server.url}/world_001`);
        expect(res.status).toBe(200);
        expect((await res.json()).scenes).toEqual([]);
    });

    test('POST /:worldId creates scene', async () => {
        const res = await fetch(`${server.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(SCENE),
        });
        expect(res.status).toBe(201);
    });

    test('GET /:worldId/:sceneId returns scene', async () => {
        const res = await fetch(`${server.url}/world_001/s1`);
        expect(res.status).toBe(200);
        expect((await res.json()).name).toBe('South Square');
    });

    test('POST /:worldId/:sceneId/enter returns 403 when locked', async () => {
        // Add a locked scene
        await fetch(`${server.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 's2', name: 'Vault', is_locked: true, unlock_condition: 'Find the key', characters_present: [] }),
        });
        const res = await fetch(`${server.url}/world_001/s2/enter`, { method: 'POST' });
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.unlock_condition).toBe('Find the key');
    });

    test('POST /:worldId/:sceneId/enter succeeds for unlocked scene', async () => {
        // First create a player
        const { writePlayer } = await import('../../src/endpoints/world-simulation/storage/players.js');
        await writePlayer(dirs, 'world_001', { id: 'p1', name: 'Hero', status: { current_location: 's2' }, inventory: [] });

        const res = await fetch(`${server.url}/world_001/s1/enter`, { method: 'POST' });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.scene.id).toBe('s1');
        expect(json.characters_present).toBeDefined();

        // Player location should be updated
        const { readPlayer } = await import('../../src/endpoints/world-simulation/storage/players.js');
        const player = await readPlayer(dirs, 'world_001');
        expect(player.status.current_location).toBe('s1');
    });
});
