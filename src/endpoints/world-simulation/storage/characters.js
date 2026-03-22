import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

function getPath(directories, charId) {
    return path.join(directories.characters, sanitize(`wc_${charId}.json`));
}

export async function readCharacter(directories, charId) {
    try {
        const text = await fs.promises.readFile(getPath(directories, charId), 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return null;
    }
}

export async function writeCharacter(directories, charId, data) {
    await writeFileAtomic(getPath(directories, charId), JSON.stringify(data, null, 2));
}

export async function listCharacters(directories, worldId) {
    try {
        const files = await fs.promises.readdir(directories.characters);
        const results = [];
        for (const f of files.filter(f => f.startsWith('wc_') && f.endsWith('.json'))) {
            try {
                const text = await fs.promises.readFile(path.join(directories.characters, f), 'utf8');
                const char = JSON.parse(text);
                if (!worldId || char.world_id === worldId) results.push(char);
            } catch { /* skip corrupted */ }
        }
        return results;
    } catch (err) {
        if (err.code === 'ENOENT') return [];
        throw err;
    }
}

export async function deleteCharacter(directories, charId) {
    try {
        await fs.promises.unlink(getPath(directories, charId));
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}
