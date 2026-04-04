import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

function getPath(directories, worldId) {
    return path.join(directories.worldEvents, sanitize(`${worldId}.json`));
}

export async function readEvents(directories, worldId) {
    try {
        const text = await fs.promises.readFile(getPath(directories, worldId), 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return { events: [] };
    }
}

export async function writeEvents(directories, worldId, data) {
    await writeFileAtomic(getPath(directories, worldId), JSON.stringify(data, null, 2));
}

// Simple per-world lock to serialize read-modify-write operations
const _locks = new Map();
async function withLock(worldId, fn) {
    const prev = _locks.get(worldId) || Promise.resolve();
    const next = prev.then(fn, fn);
    _locks.set(worldId, next);
    try { return await next; } finally {
        if (_locks.get(worldId) === next) _locks.delete(worldId);
    }
}

export async function appendEvent(directories, worldId, event) {
    return withLock(worldId, async () => {
        const data = await readEvents(directories, worldId);
        data.events.push(event);
        await writeEvents(directories, worldId, data);
    });
}

export async function deleteEvent(directories, worldId, eventId) {
    return withLock(worldId, async () => {
        const data = await readEvents(directories, worldId);
        data.events = data.events.filter(e => e.id !== eventId);
        await writeEvents(directories, worldId, data);
    });
}

