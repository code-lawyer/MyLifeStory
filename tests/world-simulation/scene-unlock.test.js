import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { router } from '../../src/endpoints/world-simulation/events.js';
import { startTestServer } from './helpers.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let url, stop, tmpDir, eventsDir, scenesDir;

beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-scene-unlock-'));
    eventsDir = path.join(tmpDir, 'events');
    scenesDir = path.join(tmpDir, 'scenes');
    fs.mkdirSync(eventsDir);
    fs.mkdirSync(scenesDir);
    const dirs = {
        worldEvents: eventsDir,
        scenes: scenesDir,
        summaries: tmpDir,
    };
    ({ url, stop } = await startTestServer(router, dirs));

    // Pre-create a locked scene with unlocked_by_event = 'evt-1'
    // Written to scenesDir so readScenes finds it at dirs.scenes/world1.json
    fs.writeFileSync(
        path.join(scenesDir, 'world1.json'),
        JSON.stringify({ scenes: [
            { id: 'scene-a', name: 'Hidden Cave', is_locked: true, unlocked_by_event: 'evt-1' },
            { id: 'scene-b', name: 'Town Square', is_locked: false },
        ]})
    );
});

afterEach(async () => {
    await stop();
    fs.rmSync(tmpDir, { recursive: true });
});

it('unlocks scene when confirmed event id matches unlocked_by_event', async () => {
    const res = await fetch(`${url}/world1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'evt-1', title: 'Found the cave', description: 'A hidden cave was discovered' }),
    });
    expect(res.status).toBe(201);
    const sceneData = JSON.parse(fs.readFileSync(path.join(scenesDir, 'world1.json'), 'utf8'));
    const cave = sceneData.scenes.find(s => s.id === 'scene-a');
    expect(cave.is_locked).toBe(false);
});

it('does not modify scenes when no scene matches', async () => {
    const res = await fetch(`${url}/world1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'evt-999', title: 'Unrelated event', description: 'Nothing changes' }),
    });
    expect(res.status).toBe(201);
    const sceneData = JSON.parse(fs.readFileSync(path.join(scenesDir, 'world1.json'), 'utf8'));
    const cave = sceneData.scenes.find(s => s.id === 'scene-a');
    expect(cave.is_locked).toBe(true); // unchanged
});
