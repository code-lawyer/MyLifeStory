import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readEvents, writeEvents, appendEvent, deleteEvent } from '../../src/endpoints/world-simulation/storage/events.js';
import { readSummaries, writeSummaries } from '../../src/endpoints/world-simulation/storage/summaries.js';
import { readScenes, writeScenes } from '../../src/endpoints/world-simulation/storage/scenes.js';
import { readPlayer, writePlayer } from '../../src/endpoints/world-simulation/storage/players.js';

let tmpDir;
let dirs;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
    ['world-events', 'world-summaries', 'scenes', 'players'].forEach(d =>
        fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = {
        worldEvents:    path.join(tmpDir, 'world-events'),
        worldSummaries: path.join(tmpDir, 'world-summaries'),
        scenes:         path.join(tmpDir, 'scenes'),
        players:        path.join(tmpDir, 'players'),
    };
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('events storage', () => {
    test('readEvents returns empty object when file does not exist', async () => {
        const result = await readEvents(dirs, 'world_001');
        expect(result).toEqual({ events: [] });
    });

    test('writeEvents persists and readEvents retrieves', async () => {
        const data = { events: [{ id: 'e1', title: 'Test Event' }] };
        writeEvents(dirs, 'world_001', data);
        const result = await readEvents(dirs, 'world_001');
        expect(result).toEqual(data);
    });

    test('appendEvent adds to existing list', async () => {
        await appendEvent(dirs, 'world_001', { id: 'e1', title: 'First' });
        await appendEvent(dirs, 'world_001', { id: 'e2', title: 'Second' });
        const result = await readEvents(dirs, 'world_001');
        expect(result.events).toHaveLength(2);
        expect(result.events[1].title).toBe('Second');
    });

    test('deleteEvent removes by id', async () => {
        await appendEvent(dirs, 'world_001', { id: 'e1', title: 'First' });
        await appendEvent(dirs, 'world_001', { id: 'e2', title: 'Second' });
        await deleteEvent(dirs, 'world_001', 'e1');
        const result = await readEvents(dirs, 'world_001');
        expect(result.events).toHaveLength(1);
        expect(result.events[0].id).toBe('e2');
    });
});

describe('summaries storage', () => {
    test('readSummaries returns empty array when file does not exist', async () => {
        const result = await readSummaries(dirs, 'world_001');
        expect(result).toEqual({ summaries: [] });
    });

    test('writeSummaries persists and readSummaries retrieves', async () => {
        const data = { summaries: [{ period: '1-20', summary: 'Early history' }] };
        writeSummaries(dirs, 'world_001', data);
        expect(await readSummaries(dirs, 'world_001')).toEqual(data);
    });
});

describe('scenes storage', () => {
    test('readScenes returns empty array when file does not exist', async () => {
        expect(await readScenes(dirs, 'world_001')).toEqual({ scenes: [] });
    });

    test('writeScenes round-trips correctly', async () => {
        const data = { scenes: [{ id: 's1', name: 'South Square' }] };
        writeScenes(dirs, 'world_001', data);
        expect(await readScenes(dirs, 'world_001')).toEqual(data);
    });
});

describe('players storage', () => {
    test('readPlayer returns null when file does not exist', async () => {
        expect(await readPlayer(dirs, 'world_001')).toBeNull();
    });

    test('writePlayer round-trips correctly', async () => {
        const player = { id: 'p1', name: 'Hero', inventory: [] };
        writePlayer(dirs, 'world_001', player);
        expect(await readPlayer(dirs, 'world_001')).toEqual(player);
    });
});
