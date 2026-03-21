import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import fetch from 'node-fetch';
import express from 'express';
import { router as worldsRouter } from '../../src/endpoints/world-simulation/worlds.js';
import { startTestServer } from './helpers.js';

// Mirror the index.js mount pattern: worlds router lives at /worlds
const router = express.Router();
router.use('/worlds', worldsRouter);

let server, url, dirs;

beforeEach(async () => {
    const tmpDir = await mkdtemp(os.tmpdir() + '/ws-worlds-');
    dirs = { worlds: tmpDir };
    server = await startTestServer(router, dirs);
    url = server.url;
});

afterEach(async () => {
    await server.stop();
    await rm(dirs.worlds, { recursive: true });
});

test('GET /worlds returns empty array', async () => {
    const r = await fetch(`${url}/worlds`);
    const data = await r.json();
    expect(r.status).toBe(200);
    expect(data).toEqual([]);
});

test('POST /worlds creates a world, GET retrieves it', async () => {
    const world = { id: 'w1', name: 'Iron Fog' };
    const post = await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(world),
    });
    expect(post.status).toBe(201);

    const get = await fetch(`${url}/worlds/w1`);
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ id: 'w1', name: 'Iron Fog' });
});

test('PUT /worlds/:worldId updates a world', async () => {
    await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'w1', name: 'Iron Fog' }),
    });
    const put = await fetch(`${url}/worlds/w1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'w1', name: 'Iron Fog Updated' }),
    });
    expect(put.status).toBe(200);
    const data = await put.json();
    expect(data.name).toBe('Iron Fog Updated');
});

test('DELETE /worlds/:worldId removes world, GET returns 404', async () => {
    await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'w1', name: 'Iron Fog' }),
    });
    const del = await fetch(`${url}/worlds/w1`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    const get = await fetch(`${url}/worlds/w1`);
    expect(get.status).toBe(404);
});

test('POST /worlds returns 400 when id or name missing', async () => {
    const r = await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No ID' }),
    });
    expect(r.status).toBe(400);
});
