import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer } from './helpers.js';

let server, tmpDir;

beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-player-'));
    fs.mkdirSync(path.join(tmpDir, 'players'), { recursive: true });
    const { router } = await import('../../src/endpoints/world-simulation/player.js');
    server = await startTestServer(router, { players: path.join(tmpDir, 'players') });
});

afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

const PLAYER = { id: 'p1', name: 'Hero', power_tier: 2, description: 'A brave soul', status: { health: 'good', mental: 'stable', reputation: 'unknown', current_location: 's1' }, inventory: [] };

describe('player endpoints', () => {
    test('GET returns 404 when no player exists', async () => {
        const res = await fetch(`${server.url}/world_001`);
        expect(res.status).toBe(404);
    });

    test('POST creates player', async () => {
        const res = await fetch(`${server.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(PLAYER),
        });
        expect(res.status).toBe(201);
    });

    test('GET retrieves created player', async () => {
        const res = await fetch(`${server.url}/world_001`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.name).toBe('Hero');
    });

    test('PATCH /status updates health and reputation but not location', async () => {
        const res = await fetch(`${server.url}/world_001/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ health: 30, reputation: 90 }),
        });
        expect(res.status).toBe(200);
        const player = await fetch(`${server.url}/world_001`).then(r => r.json());
        expect(player.status.health).toBe(30);
        expect(player.status.reputation).toBe(90);
        // location unchanged (must use scene enter)
        expect(player.status.current_location).toBe('s1');
    });

    test('POST /inventory adds item', async () => {
        const item = { id: 'item1', name: 'Magic Key', description: 'Opens the vault' };
        const res = await fetch(`${server.url}/world_001/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        expect(res.status).toBe(201);
        const player = await fetch(`${server.url}/world_001`).then(r => r.json());
        expect(player.inventory).toHaveLength(1);
        expect(player.inventory[0].name).toBe('Magic Key');
    });

    test('DELETE /inventory/:itemId removes item', async () => {
        const res = await fetch(`${server.url}/world_001/inventory/item1`, { method: 'DELETE' });
        expect(res.status).toBe(204);
        const player = await fetch(`${server.url}/world_001`).then(r => r.json());
        expect(player.inventory).toHaveLength(0);
    });
});
