import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import writeFileAtomic from 'write-file-atomic';

function getPath(directories, worldId) {
    return path.join(directories.worldSummaries, sanitize(`${worldId}.json`));
}

export async function readSummaries(directories, worldId) {
    try {
        const text = await fs.promises.readFile(getPath(directories, worldId), 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return { summaries: [] };
    }
}

export async function writeSummaries(directories, worldId, data) {
    await writeFileAtomic(getPath(directories, worldId), JSON.stringify(data, null, 2));
}
