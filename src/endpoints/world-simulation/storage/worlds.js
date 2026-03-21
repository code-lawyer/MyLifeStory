import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

function getPath(directories, worldId) {
    return path.join(directories.worlds, sanitize(`ws_${worldId}.json`));
}

export async function readWorld(directories, worldId) {
    try {
        const text = await fs.promises.readFile(getPath(directories, worldId), 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return null;
    }
}

export async function writeWorld(directories, worldId, data) {
    writeFileAtomicSync(getPath(directories, worldId), JSON.stringify(data, null, 2));
}

export async function listWorlds(directories) {
    try {
        const files = await fs.promises.readdir(directories.worlds);
        const results = [];
        for (const f of files.filter(f => f.startsWith('ws_') && f.endsWith('.json'))) {
            try {
                const text = await fs.promises.readFile(path.join(directories.worlds, f), 'utf8');
                results.push(JSON.parse(text));
            } catch { /* skip corrupted */ }
        }
        return results;
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

export async function deleteWorld(directories, worldId) {
    try {
        await fs.promises.unlink(getPath(directories, worldId));
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}
