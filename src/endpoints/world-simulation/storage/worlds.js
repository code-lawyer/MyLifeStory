import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

function getPath(dirs, worldId) {
    return path.join(dirs.worlds, sanitize(`ws_${worldId}.json`));
}

export async function readWorld(dirs, worldId) {
    try {
        const text = await fs.promises.readFile(getPath(dirs, worldId), 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return null;
    }
}

export async function writeWorld(dirs, worldId, data) {
    writeFileAtomicSync(getPath(dirs, worldId), JSON.stringify(data, null, 2));
}

export async function listWorlds(dirs) {
    try {
        const files = await fs.promises.readdir(dirs.worlds);
        const results = [];
        for (const f of files.filter(f => f.startsWith('ws_') && f.endsWith('.json'))) {
            try {
                const text = await fs.promises.readFile(path.join(dirs.worlds, f), 'utf8');
                results.push(JSON.parse(text));
            } catch { /* skip corrupted */ }
        }
        return results;
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

export async function deleteWorld(dirs, worldId) {
    try {
        await fs.promises.unlink(getPath(dirs, worldId));
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}
