import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

function getPath(directories, worldId) {
    return path.join(directories.relationships, sanitize(`rel_${worldId}.json`));
}

export async function readRelationships(directories, worldId) {
    try {
        const text = await fs.promises.readFile(getPath(directories, worldId), 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code === 'ENOENT') return { relationships: {} };
        throw err;
    }
}

export async function writeRelationships(directories, worldId, data) {
    await writeFileAtomic(getPath(directories, worldId), JSON.stringify(data, null, 2));
}
