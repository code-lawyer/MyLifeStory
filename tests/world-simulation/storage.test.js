import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readEvents, writeEvents, appendEvent, deleteEvent } from '../../src/endpoints/world-simulation/storage/events.js';

let tmpDir;
let dirs;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
    fs.mkdirSync(path.join(tmpDir, 'world-events'), { recursive: true });
    dirs = { worldEvents: path.join(tmpDir, 'world-events') };
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('events storage', () => {
    test('readEvents returns empty array when file does not exist', async () => {
        const result = await readEvents(dirs, 'world_001');
        expect(result).toEqual({ events: [] });
    });

    test('writeEvents persists and readEvents retrieves', async () => {
        const data = { events: [{ id: 'e1', title: 'Test Event' }] };
        await writeEvents(dirs, 'world_001', data);
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
