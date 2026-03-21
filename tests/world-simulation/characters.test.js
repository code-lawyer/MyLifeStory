import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import fetch from 'node-fetch';
import express from 'express';
import { router as charactersRouter } from '../../src/endpoints/world-simulation/characters.js';
import { startTestServer } from './helpers.js';

// Mirror the index.js mount pattern: characters router lives at /characters
const router = express.Router();
router.use('/characters', charactersRouter);

let server, url, dirs;

beforeEach(async () => {
    const tmpDir = await mkdtemp(os.tmpdir() + '/ws-chars-');
    dirs = { characters: tmpDir };
    server = await startTestServer(router, dirs);
    url = server.url;
});

afterEach(async () => {
    await server.stop();
    await rm(dirs.characters, { recursive: true });
});

test('GET /characters returns empty array initially', async () => {
    const r = await fetch(`${url}/characters`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
});

test('POST then GET a character by id', async () => {
    const char = { id: 'c1', name: 'Ada Walker', world_id: 'w1' };
    const post = await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(char),
    });
    expect(post.status).toBe(201);

    const get = await fetch(`${url}/characters/c1`);
    expect(get.status).toBe(200);
    expect((await get.json()).name).toBe('Ada Walker');
});

test('GET /characters?worldId filters by world', async () => {
    await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'c1', name: 'Ada', world_id: 'w1' }),
    });
    await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'c2', name: 'Bob', world_id: 'w2' }),
    });
    const r = await fetch(`${url}/characters?worldId=w1`);
    const data = await r.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('c1');
});

test('DELETE /characters/:id returns 204', async () => {
    await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'c1', name: 'Ada', world_id: 'w1' }),
    });
    const del = await fetch(`${url}/characters/c1`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    const get = await fetch(`${url}/characters/c1`);
    expect(get.status).toBe(404);
});
