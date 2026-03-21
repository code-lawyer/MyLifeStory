import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

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

export function writeEvents(directories, worldId, data) {
    writeFileAtomicSync(getPath(directories, worldId), JSON.stringify(data, null, 2));
}

export async function appendEvent(directories, worldId, event) {
    const data = await readEvents(directories, worldId);
    data.events.push(event);
    await writeEvents(directories, worldId, data);
}

export async function deleteEvent(directories, worldId, eventId) {
    const data = await readEvents(directories, worldId);
    data.events = data.events.filter(e => e.id !== eventId);
    await writeEvents(directories, worldId, data);
}
