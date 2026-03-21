# World Simulator — Backend world-simulation Module (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `world-simulation` Express module to SillyTavern's backend, providing all API endpoints needed by the world simulator frontend (card generation, event management, context budgeting, state sync, player profile, and scene management).

**Architecture:** A new `src/endpoints/world-simulation/` directory is mounted at `/api/world-sim` in `server-startup.js`. It is composed of a storage layer (plain file I/O utilities), an LLM client (thin wrapper around the user's configured API), and six routers. No existing files are modified except `src/constants.js` (add directory keys) and `src/server-startup.js` (mount router).

**Tech Stack:** Node.js ESM, Express 4, `write-file-atomic`, `sanitize-filename`, Jest with `@jest/globals`, native `fetch` for test HTTP calls.

---

## File Map

```
MODIFY  src/constants.js                                    add world-sim directory keys
MODIFY  src/server-startup.js                               mount world-sim router
MODIFY  package.json                                        add "test" script

CREATE  src/endpoints/world-simulation/index.js             main router
CREATE  src/endpoints/world-simulation/llm-client.js        LLM call utility
CREATE  src/endpoints/world-simulation/storage/
          events.js                                         read/write world-events/[worldId].json
          summaries.js                                      read/write world-summaries/[worldId].json
          scenes.js                                         read/write scenes/[worldId].json
          players.js                                        read/write players/[worldId].json
CREATE  src/endpoints/world-simulation/
          events.js                                         /events router
          context.js                                        /context router
          state.js                                          /state router
          player.js                                         /player router
          scenes.js                                         /scenes router
          generate.js                                       /generate router

CREATE  tests/world-simulation/
          helpers.js                                        shared test server helper
          storage.test.js                                   storage layer tests
          events.test.js                                    events router tests
          context.test.js                                   context builder tests
          state.test.js                                     state sync tests
          player.test.js                                    player router tests
          scenes.test.js                                    scenes router tests
          generate.test.js                                  generation router tests
```

---

## Task 1: Project Setup

**Files:**
- Modify: `package.json`
- Modify: `src/constants.js`

- [ ] **Step 1: Add test script to package.json**

In `package.json`, inside the `"scripts"` object, add:

```json
"test": "node --experimental-vm-modules node_modules/jest/bin/jest.js --config tests/jest.config.json",
"test:ws": "node --experimental-vm-modules node_modules/jest/bin/jest.js --config tests/jest.config.json --testPathPattern=tests/world-simulation"
```

- [ ] **Step 2: Add new directory keys to USER_DIRECTORY_TEMPLATE in `src/constants.js`**

After the `backups: 'backups'` line, add:

```js
worldEvents: 'world-events',
worldSummaries: 'world-summaries',
scenes: 'scenes',
players: 'players',
```

- [ ] **Step 3: Verify test command runs with zero tests**

Run: `npm run test:ws -- --passWithNoTests`
Expected: `Tests: 0 passed` with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json src/constants.js
git commit -m "feat(world-sim): add test script and directory constants"
```

---

## Task 2: Storage Layer — World Events

**Files:**
- Create: `src/endpoints/world-simulation/storage/events.js`
- Create: `tests/world-simulation/storage.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/world-simulation/storage.test.js`:

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm run test:ws`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/endpoints/world-simulation/storage/events.js`**

```js
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
    } catch {
        return { events: [] };
    }
}

export async function writeEvents(directories, worldId, data) {
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
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npm run test:ws`
Expected: All 4 storage tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/storage/events.js tests/world-simulation/storage.test.js
git commit -m "feat(world-sim): storage layer for world events"
```

---

## Task 3: Storage Layer — Summaries, Scenes, Players

**Files:**
- Create: `src/endpoints/world-simulation/storage/summaries.js`
- Create: `src/endpoints/world-simulation/storage/scenes.js`
- Create: `src/endpoints/world-simulation/storage/players.js`
- Modify: `tests/world-simulation/storage.test.js` (add tests)

- [ ] **Step 1: Add tests for remaining storage modules**

Replace the entire `tests/world-simulation/storage.test.js` with the following (the `beforeEach` now sets up all four directories):

```js
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

describe('summaries storage', () => {
    test('readSummaries returns empty array when file does not exist', async () => {
        const result = await readSummaries(dirs, 'world_001');
        expect(result).toEqual({ summaries: [] });
    });

    test('writeSummaries persists and readSummaries retrieves', async () => {
        const data = { summaries: [{ period: '1-20', summary: 'Early history' }] };
        await writeSummaries(dirs, 'world_001', data);
        expect(await readSummaries(dirs, 'world_001')).toEqual(data);
    });
});

describe('scenes storage', () => {
    test('readScenes returns empty array when file does not exist', async () => {
        expect(await readScenes(dirs, 'world_001')).toEqual({ scenes: [] });
    });

    test('writeScenes round-trips correctly', async () => {
        const data = { scenes: [{ id: 's1', name: 'South Square' }] };
        await writeScenes(dirs, 'world_001', data);
        expect(await readScenes(dirs, 'world_001')).toEqual(data);
    });
});

describe('players storage', () => {
    test('readPlayer returns null when file does not exist', async () => {
        expect(await readPlayer(dirs, 'world_001')).toBeNull();
    });

    test('writePlayer round-trips correctly', async () => {
        const player = { id: 'p1', name: 'Hero', inventory: [] };
        await writePlayer(dirs, 'world_001', player);
        expect(await readPlayer(dirs, 'world_001')).toEqual(player);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement summaries, scenes, players storage**

Create `src/endpoints/world-simulation/storage/summaries.js`:
```js
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

function getPath(directories, worldId) {
    return path.join(directories.worldSummaries, sanitize(`${worldId}.json`));
}

export async function readSummaries(directories, worldId) {
    try {
        return JSON.parse(await fs.promises.readFile(getPath(directories, worldId), 'utf8'));
    } catch { return { summaries: [] }; }
}

export async function writeSummaries(directories, worldId, data) {
    writeFileAtomicSync(getPath(directories, worldId), JSON.stringify(data, null, 2));
}
```

Create `src/endpoints/world-simulation/storage/scenes.js`:
```js
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

function getPath(directories, worldId) {
    return path.join(directories.scenes, sanitize(`${worldId}.json`));
}

export async function readScenes(directories, worldId) {
    try {
        return JSON.parse(await fs.promises.readFile(getPath(directories, worldId), 'utf8'));
    } catch { return { scenes: [] }; }
}

export async function writeScenes(directories, worldId, data) {
    writeFileAtomicSync(getPath(directories, worldId), JSON.stringify(data, null, 2));
}
```

Create `src/endpoints/world-simulation/storage/players.js`:
```js
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

function getPath(directories, worldId) {
    return path.join(directories.players, sanitize(`${worldId}.json`));
}

export async function readPlayer(directories, worldId) {
    try {
        return JSON.parse(await fs.promises.readFile(getPath(directories, worldId), 'utf8'));
    } catch { return null; }
}

export async function writePlayer(directories, worldId, player) {
    writeFileAtomicSync(getPath(directories, worldId), JSON.stringify(player, null, 2));
}
```

- [ ] **Step 4: Run tests to confirm all pass**

Run: `npm run test:ws`
Expected: All storage tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/storage/ tests/world-simulation/storage.test.js
git commit -m "feat(world-sim): storage layer for summaries, scenes, players"
```

---

## Task 4: Test Server Helper + Router Scaffold

**Files:**
- Create: `tests/world-simulation/helpers.js`
- Create: `src/endpoints/world-simulation/index.js`
- Create: `src/endpoints/world-simulation/llm-client.js`

- [ ] **Step 1: Create test server helper**

Create `tests/world-simulation/helpers.js`:

```js
import express from 'express';
import { createServer } from 'node:http';

/**
 * Starts a minimal Express app mounting the given router, returns { url, stop }.
 * Automatically injects a mock request.user with configurable directories.
 */
export async function startTestServer(router, dirs = {}) {
    const app = express();
    app.use(express.json());

    // Inject mock user with provided directories
    app.use((req, _res, next) => {
        req.user = { directories: dirs };
        next();
    });

    app.use('/api/world-sim', router);

    return new Promise((resolve) => {
        const server = createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}/api/world-sim`,
                stop: () => new Promise(r => server.close(r)),
            });
        });
    });
}
```

- [ ] **Step 2: Create LLM client**

Create `src/endpoints/world-simulation/llm-client.js`:

```js
/**
 * Minimal LLM client for world-simulation server-side calls.
 * Reads API config from the user's settings; callers can inject a mock via setLLMAdapter.
 */

let adapter = null;

/**
 * Override the LLM adapter (used in tests).
 * @param {((messages: object[], system: string) => Promise<string>)|null} fn
 */
export function setLLMAdapter(fn) {
    adapter = fn;
}

/**
 * Call the LLM and return the assistant text response.
 * @param {object[]} messages - OpenAI-style message array
 * @param {string} systemPrompt
 * @param {object} apiConfig - { apiUrl, apiKey, model }
 * @returns {Promise<string>}
 */
export async function callLLM(messages, systemPrompt, apiConfig) {
    if (adapter) return adapter(messages, systemPrompt);

    const { apiUrl, apiKey, model } = apiConfig;
    const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages,
            ],
        }),
    });

    if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}
```

- [ ] **Step 3: Create main world-simulation router**

Create `src/endpoints/world-simulation/index.js`:

```js
import express from 'express';
import { router as eventsRouter } from './events.js';
import { router as contextRouter } from './context.js';
import { router as stateRouter } from './state.js';
import { router as playerRouter } from './player.js';
import { router as scenesRouter } from './scenes.js';
import { router as generateRouter } from './generate.js';

export const router = express.Router();

router.get('/health', (_req, res) => res.json({ ok: true }));

router.use('/events', eventsRouter);
router.use('/context', contextRouter);
router.use('/state', stateRouter);
router.use('/player', playerRouter);
router.use('/scenes', scenesRouter);
router.use('/generate', generateRouter);
```

- [ ] **Step 4: Create stub routers** (each returns 501 for now, to let the index compile)

Create `src/endpoints/world-simulation/events.js`:
```js
import express from 'express';
export const router = express.Router();
```

Repeat for `context.js`, `state.js`, `player.js`, `scenes.js`, `generate.js` — same two lines each.

- [ ] **Step 5: Write health check test**

Create `tests/world-simulation/events.test.js` (start here, expand later):

```js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { router } from '../../src/endpoints/world-simulation/index.js';
import { startTestServer } from './helpers.js';

let server;

beforeAll(async () => { server = await startTestServer(router); });
afterAll(async () => { await server.stop(); });

describe('GET /health', () => {
    test('returns ok', async () => {
        const res = await fetch(`${server.url}/health`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
    });
});
```

- [ ] **Step 6: Run test**

Run: `npm run test:ws`
Expected: health check PASS.

- [ ] **Step 7: Commit**

```bash
git add src/endpoints/world-simulation/ tests/world-simulation/helpers.js tests/world-simulation/events.test.js
git commit -m "feat(world-sim): router scaffold, LLM client, test helper"
```

---

## Task 5: Events Router — CRUD Endpoints

**Files:**
- Modify: `src/endpoints/world-simulation/events.js`
- Modify: `tests/world-simulation/events.test.js`

- [ ] **Step 1: Add CRUD tests**

Append to `tests/world-simulation/events.test.js`:

```js
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Add these in a separate describe block that sets up its own server with tmpDir
describe('events CRUD', () => {
    let crudServer;
    let tmpDir;

    beforeAll(async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-events-'));
        fs.mkdirSync(path.join(tmpDir, 'world-events'), { recursive: true });
        const dirs = { worldEvents: path.join(tmpDir, 'world-events') };
        const { router: eventsRouter } = await import('../../src/endpoints/world-simulation/events.js');
        crudServer = await startTestServer(eventsRouter, dirs);
    });

    afterAll(async () => {
        await crudServer.stop();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('GET /:worldId returns empty list initially', async () => {
        const res = await fetch(`${crudServer.url}/world_001`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.events).toEqual([]);
    });

    test('POST /:worldId adds an event', async () => {
        const event = { id: 'e1', title: 'Test', description: 'Desc', impact_scope: 'minor', confirmed_by_user: true };
        const res = await fetch(`${crudServer.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
        });
        expect(res.status).toBe(201);
        const list = await fetch(`${crudServer.url}/world_001`).then(r => r.json());
        expect(list.events).toHaveLength(1);
        expect(list.events[0].id).toBe('e1');
    });

    test('DELETE /:worldId/:eventId removes the event', async () => {
        const res = await fetch(`${crudServer.url}/world_001/e1`, { method: 'DELETE' });
        expect(res.status).toBe(204);
        const list = await fetch(`${crudServer.url}/world_001`).then(r => r.json());
        expect(list.events).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL — 404 for all routes.

- [ ] **Step 3: Implement events CRUD router**

Replace `src/endpoints/world-simulation/events.js`:

```js
import express from 'express';
import { readEvents, writeEvents, appendEvent, deleteEvent } from './storage/events.js';

export const router = express.Router();

// GET /:worldId — list events
router.get('/:worldId', async (req, res) => {
    try {
        const data = await readEvents(req.user.directories, req.params.worldId);
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId — add confirmed event
router.post('/:worldId', async (req, res) => {
    try {
        const event = req.body;
        if (!event?.id || !event?.title) {
            return res.status(400).json({ error: 'missing_fields', required: ['id', 'title'] });
        }
        await appendEvent(req.user.directories, req.params.worldId, event);
        res.status(201).json(event);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// DELETE /:worldId/:eventId — remove event
router.delete('/:worldId/:eventId', async (req, res) => {
    try {
        await deleteEvent(req.user.directories, req.params.worldId, req.params.eventId);
        res.sendStatus(204);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:ws`
Expected: All events CRUD tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/events.js tests/world-simulation/events.test.js
git commit -m "feat(world-sim): events CRUD endpoints"
```

---

## Task 6: Events Router — Propose & Compress

**Files:**
- Modify: `src/endpoints/world-simulation/events.js`
- Modify: `tests/world-simulation/events.test.js`

- [ ] **Step 1: Add propose and compress tests**

Append to `tests/world-simulation/events.test.js`:

```js
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

describe('POST /events/:worldId/propose', () => {
    let proposeServer;
    let tmpDir2;

    beforeAll(async () => {
        tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-propose-'));
        fs.mkdirSync(path.join(tmpDir2, 'world-events'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir2, 'world-summaries'), { recursive: true });
        const dirs = {
            worldEvents: path.join(tmpDir2, 'world-events'),
            worldSummaries: path.join(tmpDir2, 'world-summaries'),
        };
        const { router: eventsRouter } = await import('../../src/endpoints/world-simulation/events.js');
        proposeServer = await startTestServer(eventsRouter, dirs);
    });

    afterAll(async () => {
        await proposeServer.stop();
        fs.rmSync(tmpDir2, { recursive: true, force: true });
        setLLMAdapter(null);
    });

    test('returns null when LLM finds no significant event', async () => {
        setLLMAdapter(async () => JSON.stringify({ significant: false }));
        const res = await fetch(`${proposeServer.url}/world_001/propose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatHistory: [{ role: 'user', content: 'Hello' }] }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal).toBeNull();
    });

    test('returns narrative and event_draft when LLM finds significant event', async () => {
        setLLMAdapter(async () => JSON.stringify({
            significant: true,
            title: 'Great Uprising',
            description: 'Workers revolt.',
            impact_scope: 'major',
            affected_characters: [],
            narrative: '冥冥中，似乎发生了一件足以影响世界的大事……',
        }));
        const res = await fetch(`${proposeServer.url}/world_001/propose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatHistory: [{ role: 'user', content: 'We started the revolt.' }] }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.proposal.narrative).toContain('冥冥中');
        expect(json.proposal.event_draft.title).toBe('Great Uprising');
    });
});

describe('POST /events/:worldId/compress', () => {
    let compressServer;
    let tmpDir3;

    beforeAll(async () => {
        tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-compress-'));
        fs.mkdirSync(path.join(tmpDir3, 'world-events'), { recursive: true });
        fs.mkdirSync(path.join(tmpDir3, 'world-summaries'), { recursive: true });
        const dirs = {
            worldEvents: path.join(tmpDir3, 'world-events'),
            worldSummaries: path.join(tmpDir3, 'world-summaries'),
        };
        const { router: eventsRouter } = await import('../../src/endpoints/world-simulation/events.js');
        compressServer = await startTestServer(eventsRouter, dirs);
    });

    afterAll(async () => {
        await compressServer.stop();
        fs.rmSync(tmpDir3, { recursive: true, force: true });
        setLLMAdapter(null);
    });

    test('compresses oldest non-major events and writes summary', async () => {
        // Seed 25 events (first 20 minor, last 5 major)
        const { appendEvent: append } = await import('../../src/endpoints/world-simulation/storage/events.js');
        const dirs = { worldEvents: path.join(tmpDir3, 'world-events') };
        for (let i = 0; i < 20; i++) {
            await append(dirs, 'world_001', { id: `e${i}`, title: `Event ${i}`, impact_scope: 'minor' });
        }
        for (let i = 20; i < 25; i++) {
            await append(dirs, 'world_001', { id: `e${i}`, title: `Major ${i}`, impact_scope: 'major' });
        }

        setLLMAdapter(async () => 'Early period: 20 minor events occurred.');

        const res = await fetch(`${compressServer.url}/world_001/compress`, { method: 'POST' });
        expect(res.status).toBe(200);

        const { readSummaries } = await import('../../src/endpoints/world-simulation/storage/summaries.js');
        const sumDirs = { worldSummaries: path.join(tmpDir3, 'world-summaries') };
        const summaries = await readSummaries(sumDirs, 'world_001');
        expect(summaries.summaries).toHaveLength(1);
        expect(summaries.summaries[0].summary).toContain('Early period');

        // Major events should remain
        const { readEvents: re } = await import('../../src/endpoints/world-simulation/storage/events.js');
        const remaining = await re(dirs, 'world_001');
        expect(remaining.events.every(e => e.impact_scope === 'major')).toBe(true);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL — propose and compress routes return 404.

- [ ] **Step 3: Add propose and compress to events router**

Append to `src/endpoints/world-simulation/events.js`:

```js
import { readSummaries, writeSummaries } from './storage/summaries.js';
import { callLLM } from './llm-client.js';
import { randomUUID } from 'node:crypto';

const PROPOSE_SYSTEM = `You are a world narrator. Analyze the provided chat history.
If a significant world-changing event occurred, respond with JSON:
{"significant":true,"title":"...","description":"...","impact_scope":"minor|moderate|major","affected_characters":[],"narrative":"叙事化的中文提示，以"冥冥中"开头"}
If nothing significant occurred, respond with JSON: {"significant":false}
Only respond with JSON, no other text.`;

const COMPRESS_SYSTEM = `You are a world historian. Summarize the provided list of events into a single paragraph of narrative prose. Be concise. Output plain text only.`;

// POST /:worldId/propose
router.post('/:worldId/propose', async (req, res) => {
    try {
        const { chatHistory, apiConfig = {} } = req.body;
        if (!chatHistory) return res.status(400).json({ error: 'missing_fields' });

        const messages = [{ role: 'user', content: JSON.stringify(chatHistory) }];
        let raw;
        try {
            raw = await callLLM(messages, PROPOSE_SYSTEM, apiConfig);
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        let parsed;
        try { parsed = JSON.parse(raw); }
        catch { return res.status(422).json({ error: 'parse_failed', raw }); }

        if (!parsed.significant) return res.json({ proposal: null });

        const event_draft = {
            id: randomUUID(),
            world_id: req.params.worldId,
            timestamp: new Date().toISOString(),
            title: parsed.title,
            description: parsed.description,
            impact_scope: parsed.impact_scope || 'moderate',
            affected_characters: parsed.affected_characters || [],
            confirmed_by_user: false,
        };

        res.json({ proposal: { narrative: parsed.narrative, event_draft } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId/compress — compress oldest non-major events into a summary
router.post('/:worldId/compress', async (req, res) => {
    try {
        const dirs = req.user.directories;
        const { apiConfig = {} } = req.body || {};
        const data = await readEvents(dirs, req.params.worldId);

        const toCompress = data.events.filter(e => e.impact_scope !== 'major');
        const toKeep = data.events.filter(e => e.impact_scope === 'major');

        if (toCompress.length === 0) return res.json({ compressed: 0 });

        let summaryText;
        try {
            summaryText = await callLLM(
                [{ role: 'user', content: JSON.stringify(toCompress) }],
                COMPRESS_SYSTEM,
                apiConfig,
            );
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        const summaries = await readSummaries(dirs, req.params.worldId);
        summaries.summaries.push({
            period: `Events ${toCompress[0].id} – ${toCompress[toCompress.length - 1].id}`,
            summary: summaryText,
            compressed_at: new Date().toISOString(),
        });
        await writeSummaries(dirs, req.params.worldId, summaries);
        await writeEvents(dirs, req.params.worldId, { events: toKeep });

        res.json({ compressed: toCompress.length, kept: toKeep.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:ws`
Expected: All events tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/events.js tests/world-simulation/events.test.js
git commit -m "feat(world-sim): event propose and compress endpoints"
```

---

## Task 7: Context Budget Builder

**Files:**
- Modify: `src/endpoints/world-simulation/context.js`
- Create: `tests/world-simulation/context.test.js`

- [ ] **Step 1: Write tests**

Create `tests/world-simulation/context.test.js`:

```js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { startTestServer } from './helpers.js';
import { router } from '../../src/endpoints/world-simulation/context.js';

let server;
beforeAll(async () => { server = await startTestServer(router, {}); });
afterAll(async () => { await server.stop(); });

const BASE_PAYLOAD = {
    worldCard: { foundation: { background: 'A', geography: 'B', rules: 'C' }, power_system: { description: 'D', tiers: [] }, current_state: { summary: 'E' } },
    eventLog: [{ title: 'Event 1', description: 'Desc' }],
    archivedSummaries: [],
    characters: [{ name: 'Ada', identity: { description: 'tall' }, voice: { style: 'direct', example_lines: ['Hi'] }, current_state: { status: 'busy' } }],
    activeCharacters: ['Ada'],
    currentScene: { name: 'Square', description: 'Dusty' },
    playerStatus: { health: 'good', reputation: 'known' },
    chatHistory: [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' }],
    tokenBudget: 1000,
    mode: 'intimate',
};

describe('POST /context/build', () => {
    test('returns sections with intimate mode', async () => {
        const res = await fetch(`${server.url}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(BASE_PAYLOAD),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json).toHaveProperty('systemPrompt');
        expect(json).toHaveProperty('trimmedChatHistory');
        expect(json.mode).toBe('intimate');
        expect(typeof json.systemPrompt).toBe('string');
        expect(json.systemPrompt.length).toBeGreaterThan(0);
    });

    test('ensemble mode allocates more budget to events than intimate', async () => {
        const [intimateRes, ensembleRes] = await Promise.all([
            fetch(`${server.url}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...BASE_PAYLOAD, mode: 'intimate' }) }).then(r => r.json()),
            fetch(`${server.url}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...BASE_PAYLOAD, mode: 'ensemble' }) }).then(r => r.json()),
        ]);
        // Ensemble should have more event content in system prompt
        const ensembleEventContent = (ensembleRes.systemPrompt.match(/Event 1/g) || []).length;
        const intimateEventContent = (intimateRes.systemPrompt.match(/Event 1/g) || []).length;
        expect(ensembleEventContent).toBeGreaterThanOrEqual(intimateEventContent);
    });

    test('returns 400 when required fields missing', async () => {
        const res = await fetch(`${server.url}/build`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'intimate' }),
        });
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL — 404.

- [ ] **Step 3: Implement context budget builder**

Replace `src/endpoints/world-simulation/context.js`:

```js
import express from 'express';
export const router = express.Router();

const BUDGETS = {
    intimate: { worldBase: 0.08, scene: 0.07, player: 0.05, events: 0.08, characters: 0.22, chat: 0.50 },
    ensemble: { worldBase: 0.08, scene: 0.07, player: 0.05, events: 0.20, characters: 0.25, chat: 0.35 },
    epic:     { worldBase: 0.15, scene: 0.05, player: 0.05, events: 0.30, characters: 0.20, chat: 0.25 },
};

const CHARS_PER_TOKEN = 4; // rough estimate

function truncate(text, maxChars) {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars - 3) + '...';
}

// POST /build
router.post('/build', (req, res) => {
    const { worldCard, eventLog, archivedSummaries, characters, activeCharacters,
            currentScene, playerStatus, chatHistory, tokenBudget, mode } = req.body;

    if (!worldCard || !chatHistory || !tokenBudget || !mode) {
        return res.status(400).json({ error: 'missing_fields' });
    }

    const budget = BUDGETS[mode] || BUDGETS.intimate;
    const totalChars = tokenBudget * CHARS_PER_TOKEN;

    // Build world base section
    const worldBaseChars = Math.floor(totalChars * budget.worldBase);
    const worldBaseText = [
        `# World Background\n${worldCard.foundation?.background || ''}`,
        `# Geography\n${worldCard.foundation?.geography || ''}`,
        `# Rules\n${worldCard.foundation?.rules || ''}`,
        `# Power System\n${worldCard.power_system?.description || ''}`,
        worldCard.power_system?.tiers?.map(t => `Level ${t.level} (${t.name}): ${t.description}`).join('\n') || '',
        worldCard.power_system?.constraints ? `Constraints: ${worldCard.power_system.constraints}` : '',
    ].filter(Boolean).join('\n\n');

    // Build events section
    const eventsChars = Math.floor(totalChars * budget.events);
    const summaryText = (archivedSummaries || []).map(s => s.summary).join('\n');
    const eventText = (eventLog || []).map(e => `[${e.impact_scope || 'event'}] ${e.title}: ${e.description}`).join('\n');
    const fullEventsText = summaryText ? `${summaryText}\n\nRecent Events:\n${eventText}` : `World Events:\n${eventText}`;

    // Build characters section
    const charBudgetChars = Math.floor(totalChars * budget.characters);
    // activeCharacters is an array of character IDs; fall back to matching by name if id field is absent
    const activeChars = (characters || []).filter(c =>
        !activeCharacters || activeCharacters.includes(c.id) || activeCharacters.includes(c.name));
    const charsPerChar = activeChars.length > 0 ? Math.floor(charBudgetChars / activeChars.length) : charBudgetChars;
    const charsText = activeChars.map(c => {
        const base = `## ${c.name}\n${c.identity?.description || ''}\nPersonality: ${c.identity?.personality || ''}\nStatus: ${c.current_state?.status || ''}`;
        const voice = `Voice: ${c.voice?.style || ''}\nExamples: ${(c.voice?.example_lines || []).join(' | ')}`;
        return truncate(`${base}\n${voice}`, charsPerChar);
    }).join('\n\n');

    // Build scene section
    const sceneChars = Math.floor(totalChars * budget.scene);
    const sceneText = currentScene ? `# Current Location: ${currentScene.name}\n${currentScene.description || ''}` : '';

    // Build player section
    const playerChars = Math.floor(totalChars * budget.player);
    const playerText = playerStatus ? `# Player Status\n${JSON.stringify(playerStatus)}` : '';

    // Build chat history (remaining budget)
    const chatChars = Math.floor(totalChars * budget.chat);
    let chatUsed = 0;
    const trimmedChatHistory = [];
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        const msg = chatHistory[i];
        const len = (msg.content || '').length;
        if (chatUsed + len > chatChars) break;
        trimmedChatHistory.unshift(msg);
        chatUsed += len;
    }

    const systemPrompt = [
        truncate(worldBaseText, worldBaseChars),
        truncate(sceneText, sceneChars),
        truncate(playerText, playerChars),
        truncate(fullEventsText, eventsChars),
        truncate(`# Characters\n${charsText}`, charBudgetChars),
    ].filter(Boolean).join('\n\n---\n\n');

    res.json({ systemPrompt, trimmedChatHistory, mode });
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:ws`
Expected: All context tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/context.js tests/world-simulation/context.test.js
git commit -m "feat(world-sim): context budget builder"
```

---

## Task 8: State Sync Router

**Files:**
- Modify: `src/endpoints/world-simulation/state.js`
- Create: `tests/world-simulation/state.test.js`

- [ ] **Step 1: Write tests**

Create `tests/world-simulation/state.test.js`:

```js
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server, tmpDir, dirs;

beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-state-'));
    ['world-events', 'world-summaries', 'worlds'].forEach(d =>
        fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = {
        worldEvents: path.join(tmpDir, 'world-events'),
        worldSummaries: path.join(tmpDir, 'world-summaries'),
        worlds: path.join(tmpDir, 'worlds'),
    };
    const { router } = await import('../../src/endpoints/world-simulation/state.js');
    server = await startTestServer(router, dirs);
});

afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    setLLMAdapter(null);
});

describe('GET /state/:worldId', () => {
    test('returns 404 when world file does not exist', async () => {
        const res = await fetch(`${server.url}/nonexistent`);
        expect(res.status).toBe(404);
    });
});

describe('POST /state/:worldId/update', () => {
    beforeEach(() => setLLMAdapter(null));

    test('calls LLM and updates current_state in world file', async () => {
        // Create a world file first
        const worldData = { id: 'w1', name: 'Test World', current_state: { summary: 'Old summary', updated_at: '' } };
        fs.writeFileSync(path.join(dirs.worlds, 'w1.json'), JSON.stringify(worldData));

        setLLMAdapter(async () => 'New summary: the world has changed.');

        const res = await fetch(`${server.url}/w1/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiConfig: {} }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.current_state.summary).toContain('New summary');
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL — 404.

- [ ] **Step 3: Implement state router**

Replace `src/endpoints/world-simulation/state.js`:

```js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { readEvents } from './storage/events.js';
import { readSummaries } from './storage/summaries.js';
import { callLLM } from './llm-client.js';

export const router = express.Router();

const STATE_SYSTEM = `You are a world historian. Given a list of world events, write a concise 2-3 sentence summary of the current world state in Chinese. Output plain text only.`;

function getWorldPath(directories, worldId) {
    return path.join(directories.worlds, sanitize(`${worldId}.json`));
}

// GET /:worldId
router.get('/:worldId', async (req, res) => {
    try {
        const worldPath = getWorldPath(req.user.directories, req.params.worldId);
        if (!fs.existsSync(worldPath)) return res.status(404).json({ error: 'world_not_found' });
        const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
        const events = await readEvents(req.user.directories, req.params.worldId);
        const summaries = await readSummaries(req.user.directories, req.params.worldId);
        res.json({ current_state: world.current_state, event_count: events.events.length, summaries: summaries.summaries });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});

// POST /:worldId/update
router.post('/:worldId/update', async (req, res) => {
    try {
        const dirs = req.user.directories;
        const { apiConfig = {} } = req.body || {};
        const worldPath = getWorldPath(dirs, req.params.worldId);
        if (!fs.existsSync(worldPath)) return res.status(404).json({ error: 'world_not_found' });

        const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'));
        const events = await readEvents(dirs, req.params.worldId);
        const summaries = await readSummaries(dirs, req.params.worldId);

        const context = [
            ...(summaries.summaries.map(s => ({ role: 'assistant', content: s.summary }))),
            { role: 'user', content: JSON.stringify(events.events) },
        ];

        let newSummary;
        try {
            newSummary = await callLLM(context, STATE_SYSTEM, apiConfig);
        } catch {
            return res.status(502).json({ error: 'llm_unavailable' });
        }

        world.current_state = { summary: newSummary, updated_at: new Date().toISOString(), event_count: events.events.length };
        writeFileAtomicSync(worldPath, JSON.stringify(world, null, 2));
        res.json({ current_state: world.current_state });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'internal_error' });
    }
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:ws`
Expected: All state tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/state.js tests/world-simulation/state.test.js
git commit -m "feat(world-sim): world state sync endpoints"
```

---

## Task 9: Player Router

**Files:**
- Modify: `src/endpoints/world-simulation/player.js`
- Create: `tests/world-simulation/player.test.js`

- [ ] **Step 1: Write tests**

Create `tests/world-simulation/player.test.js`:

```js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer } from './helpers.js';

let server, tmpDir;

beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-player-'));
    fs.mkdirSync(path.join(tmpDir, 'players'), { recursive: true });
    const { router } = await import('../../src/endpoints/world-simulation/player.js');
    server = await startTestServer(router, { players: path.join(tmpDir, 'players') });
});

afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

const PLAYER = { id: 'p1', name: 'Hero', power_tier: 2, description: 'A brave soul', status: { health: 'good', mental: 'stable', reputation: 'unknown', current_location: 's1' }, inventory: [] };

describe('player endpoints', () => {
    test('GET returns 404 when no player exists', async () => {
        const res = await fetch(`${server.url}/world_001`);
        expect(res.status).toBe(404);
    });

    test('POST creates player', async () => {
        const res = await fetch(`${server.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(PLAYER),
        });
        expect(res.status).toBe(201);
    });

    test('GET retrieves created player', async () => {
        const res = await fetch(`${server.url}/world_001`);
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.name).toBe('Hero');
    });

    test('PATCH /status updates health and reputation but not location', async () => {
        const res = await fetch(`${server.url}/world_001/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ health: 'injured', reputation: 'feared' }),
        });
        expect(res.status).toBe(200);
        const player = await fetch(`${server.url}/world_001`).then(r => r.json());
        expect(player.status.health).toBe('injured');
        expect(player.status.reputation).toBe('feared');
        // location unchanged (must use scene enter)
        expect(player.status.current_location).toBe('s1');
    });

    test('POST /inventory adds item', async () => {
        const item = { id: 'item1', name: 'Magic Key', description: 'Opens the vault' };
        const res = await fetch(`${server.url}/world_001/inventory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
        });
        expect(res.status).toBe(201);
        const player = await fetch(`${server.url}/world_001`).then(r => r.json());
        expect(player.inventory).toHaveLength(1);
        expect(player.inventory[0].name).toBe('Magic Key');
    });

    test('DELETE /inventory/:itemId removes item', async () => {
        const res = await fetch(`${server.url}/world_001/inventory/item1`, { method: 'DELETE' });
        expect(res.status).toBe(204);
        const player = await fetch(`${server.url}/world_001`).then(r => r.json());
        expect(player.inventory).toHaveLength(0);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL.

- [ ] **Step 3: Implement player router**

Replace `src/endpoints/world-simulation/player.js`:

```js
import express from 'express';
import { readPlayer, writePlayer } from './storage/players.js';

export const router = express.Router();

router.get('/:worldId', async (req, res) => {
    const player = await readPlayer(req.user.directories, req.params.worldId);
    if (!player) return res.status(404).json({ error: 'player_not_found' });
    res.json(player);
});

router.post('/:worldId', async (req, res) => {
    try {
        const player = req.body;
        if (!player?.name) return res.status(400).json({ error: 'missing_fields' });
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.status(201).json(player);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.put('/:worldId', async (req, res) => {
    try {
        await writePlayer(req.user.directories, req.params.worldId, req.body);
        res.json(req.body);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PATCH /status — update health/mental/reputation only (NOT current_location)
router.patch('/:worldId/status', async (req, res) => {
    try {
        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });
        const { health, mental, reputation } = req.body;
        if (health !== undefined) player.status.health = health;
        if (mental !== undefined) player.status.mental = mental;
        if (reputation !== undefined) player.status.reputation = reputation;
        // current_location is intentionally excluded — use /scenes/:id/enter
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.json(player);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.post('/:worldId/inventory', async (req, res) => {
    try {
        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });
        const item = req.body;
        if (!item?.id || !item?.name) return res.status(400).json({ error: 'missing_fields' });
        player.inventory = player.inventory || [];
        player.inventory.push(item);
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.status(201).json(item);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.delete('/:worldId/inventory/:itemId', async (req, res) => {
    try {
        const player = await readPlayer(req.user.directories, req.params.worldId);
        if (!player) return res.status(404).json({ error: 'player_not_found' });
        player.inventory = (player.inventory || []).filter(i => i.id !== req.params.itemId);
        await writePlayer(req.user.directories, req.params.worldId, player);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:ws`
Expected: All player tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/player.js tests/world-simulation/player.test.js
git commit -m "feat(world-sim): player profile and inventory endpoints"
```

---

## Task 10: Scenes Router

**Files:**
- Modify: `src/endpoints/world-simulation/scenes.js`
- Create: `tests/world-simulation/scenes.test.js`

- [ ] **Step 1: Write tests**

Create `tests/world-simulation/scenes.test.js`:

```js
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startTestServer } from './helpers.js';

let server, tmpDir, dirs;

beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-scenes-'));
    ['scenes', 'players'].forEach(d => fs.mkdirSync(path.join(tmpDir, d), { recursive: true }));
    dirs = { scenes: path.join(tmpDir, 'scenes'), players: path.join(tmpDir, 'players') };
    const { router } = await import('../../src/endpoints/world-simulation/scenes.js');
    server = await startTestServer(router, dirs);
});

afterAll(async () => {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

const SCENE = { id: 's1', name: 'South Square', description: 'Dusty square', accessible_from: [], characters_present: [], is_locked: false };

describe('scenes endpoints', () => {
    test('GET /:worldId returns empty list', async () => {
        const res = await fetch(`${server.url}/world_001`);
        expect(res.status).toBe(200);
        expect((await res.json()).scenes).toEqual([]);
    });

    test('POST /:worldId creates scene', async () => {
        const res = await fetch(`${server.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(SCENE),
        });
        expect(res.status).toBe(201);
    });

    test('GET /:worldId/:sceneId returns scene', async () => {
        const res = await fetch(`${server.url}/world_001/s1`);
        expect(res.status).toBe(200);
        expect((await res.json()).name).toBe('South Square');
    });

    test('POST /:worldId/:sceneId/enter returns 403 when locked', async () => {
        // Add a locked scene
        await fetch(`${server.url}/world_001`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: 's2', name: 'Vault', is_locked: true, unlock_condition: 'Find the key', characters_present: [] }),
        });
        const res = await fetch(`${server.url}/world_001/s2/enter`, { method: 'POST' });
        expect(res.status).toBe(403);
        const json = await res.json();
        expect(json.unlock_condition).toBe('Find the key');
    });

    test('POST /:worldId/:sceneId/enter succeeds for unlocked scene', async () => {
        // First create a player
        const { writePlayer } = await import('../../src/endpoints/world-simulation/storage/players.js');
        await writePlayer(dirs, 'world_001', { id: 'p1', name: 'Hero', status: { current_location: 's2' }, inventory: [] });

        const res = await fetch(`${server.url}/world_001/s1/enter`, { method: 'POST' });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.scene.id).toBe('s1');
        expect(json.characters_present).toBeDefined();

        // Player location should be updated
        const { readPlayer } = await import('../../src/endpoints/world-simulation/storage/players.js');
        const player = await readPlayer(dirs, 'world_001');
        expect(player.status.current_location).toBe('s1');
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL.

- [ ] **Step 3: Implement scenes router**

Replace `src/endpoints/world-simulation/scenes.js`:

```js
import express from 'express';
import { readScenes, writeScenes } from './storage/scenes.js';
import { readPlayer, writePlayer } from './storage/players.js';

export const router = express.Router();

router.get('/:worldId', async (req, res) => {
    res.json(await readScenes(req.user.directories, req.params.worldId));
});

router.post('/:worldId', async (req, res) => {
    try {
        const scene = req.body;
        if (!scene?.id || !scene?.name) return res.status(400).json({ error: 'missing_fields' });
        const data = await readScenes(req.user.directories, req.params.worldId);
        data.scenes.push(scene);
        await writeScenes(req.user.directories, req.params.worldId, data);
        res.status(201).json(scene);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.get('/:worldId/:sceneId', async (req, res) => {
    const data = await readScenes(req.user.directories, req.params.worldId);
    const scene = data.scenes.find(s => s.id === req.params.sceneId);
    if (!scene) return res.status(404).json({ error: 'scene_not_found' });
    res.json(scene);
});

router.put('/:worldId/:sceneId', async (req, res) => {
    try {
        const data = await readScenes(req.user.directories, req.params.worldId);
        const idx = data.scenes.findIndex(s => s.id === req.params.sceneId);
        if (idx === -1) return res.status(404).json({ error: 'scene_not_found' });
        data.scenes[idx] = { ...data.scenes[idx], ...req.body, id: req.params.sceneId };
        await writeScenes(req.user.directories, req.params.worldId, data);
        res.json(data.scenes[idx]);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.delete('/:worldId/:sceneId', async (req, res) => {
    try {
        const data = await readScenes(req.user.directories, req.params.worldId);
        data.scenes = data.scenes.filter(s => s.id !== req.params.sceneId);
        await writeScenes(req.user.directories, req.params.worldId, data);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST /:worldId/:sceneId/enter
router.post('/:worldId/:sceneId/enter', async (req, res) => {
    try {
        const dirs = req.user.directories;
        const data = await readScenes(dirs, req.params.worldId);
        const scene = data.scenes.find(s => s.id === req.params.sceneId);
        if (!scene) return res.status(404).json({ error: 'scene_not_found' });
        if (scene.is_locked) return res.status(403).json({ error: 'scene_locked', unlock_condition: scene.unlock_condition });

        // Update player location
        const player = await readPlayer(dirs, req.params.worldId);
        if (player) {
            player.status = player.status || {};
            player.status.current_location = req.params.sceneId;
            await writePlayer(dirs, req.params.worldId, player);
        }

        res.json({ scene, characters_present: scene.characters_present || [] });
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:ws`
Expected: All scenes tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/scenes.js tests/world-simulation/scenes.test.js
git commit -m "feat(world-sim): scene management and enter endpoints"
```

---

## Task 11: Card Generation Router

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js`
- Create: `tests/world-simulation/generate.test.js`

- [ ] **Step 1: Write tests**

Create `tests/world-simulation/generate.test.js`:

```js
import { describe, test, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import { startTestServer } from './helpers.js';
import { setLLMAdapter } from '../../src/endpoints/world-simulation/llm-client.js';

let server;

beforeAll(async () => {
    const { router } = await import('../../src/endpoints/world-simulation/generate.js');
    server = await startTestServer(router, {});
});

afterAll(async () => {
    await server.stop();
    setLLMAdapter(null);
});

afterEach(() => setLLMAdapter(null));

const WORLD_DRAFT = {
    foundation: { background: 'Steampunk city', geography: 'Floating islands', rules: 'Magic suppressed' },
    power_system: { description: 'Mechanical tiers', tiers: [], constraints: '' },
    current_state: { summary: 'City is stable' },
};

describe('POST /generate/world', () => {
    test('returns a structured world card draft', async () => {
        setLLMAdapter(async () => JSON.stringify(WORLD_DRAFT));
        const res = await fetch(`${server.url}/world`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'A steampunk city with floating islands' }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.draft.foundation.background).toBe('Steampunk city');
    });

    test('returns 502 on LLM failure', async () => {
        setLLMAdapter(async () => { throw new Error('LLM down'); });
        const res = await fetch(`${server.url}/world`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'test' }),
        });
        expect(res.status).toBe(502);
    });
});

describe('POST /generate/world/refine', () => {
    test('returns refined draft with updated section', async () => {
        const refined = { ...WORLD_DRAFT, foundation: { ...WORLD_DRAFT.foundation, background: 'Dark steampunk city' } };
        setLLMAdapter(async () => JSON.stringify(refined));
        const res = await fetch(`${server.url}/world/refine`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft: WORLD_DRAFT, section: 'foundation', instruction: 'Make it darker' }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.draft.foundation.background).toBe('Dark steampunk city');
    });
});

const CHAR_DRAFT = {
    name: 'Ada Walker',
    identity: { description: 'Tall woman with mechanical arm', personality: 'Stubborn and clever', background: 'Self-taught engineer' },
    power_tier: 2,
    current_state: { relationship_to_player: 'neutral', status: 'working in her workshop' },
    voice: { style: 'Direct and technical', example_lines: ['Gears never lie.'] },
};

describe('POST /generate/character', () => {
    test('returns a structured character card draft', async () => {
        setLLMAdapter(async () => JSON.stringify(CHAR_DRAFT));
        const res = await fetch(`${server.url}/character`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'A female engineer with a mechanical arm', worldContext: { power_system: { tiers: [] } } }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.draft.name).toBe('Ada Walker');
        expect(json.draft.power_tier).toBe(2);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm run test:ws`
Expected: FAIL.

- [ ] **Step 3: Implement generate router**

Replace `src/endpoints/world-simulation/generate.js`:

```js
import express from 'express';
import { callLLM } from './llm-client.js';

export const router = express.Router();

const WORLD_GEN_SYSTEM = `You are a world-building assistant. Generate a structured world card as JSON with this exact shape:
{"foundation":{"background":"","geography":"","rules":""},"power_system":{"description":"","tiers":[{"level":1,"name":"","description":""}],"constraints":"","notes":""},"current_state":{"summary":""}}
Respond only with valid JSON, no other text.`;

const WORLD_REFINE_SYSTEM = (section) => `You are a world-building assistant. The user wants to refine the "${section}" section of their world card. Return the complete updated world card JSON with the same shape as the input. Respond only with valid JSON.`;

const CHAR_GEN_SYSTEM = `You are a character creation assistant. Generate a structured character card as JSON with this exact shape:
{"name":"","identity":{"description":"","personality":"","background":""},"power_tier":1,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]}}
Assign a power_tier consistent with the world's power system. Respond only with valid JSON.`;

async function generate(req, res, systemPrompt, userContent) {
    const { apiConfig = {} } = req.body;
    let raw;
    try { raw = await callLLM([{ role: 'user', content: userContent }], systemPrompt, apiConfig); }
    catch { return res.status(502).json({ error: 'llm_unavailable' }); }

    let draft;
    try { draft = JSON.parse(raw); }
    catch { return res.status(422).json({ error: 'parse_failed', raw }); }

    res.json({ draft });
}

// POST /world
router.post('/world', async (req, res) => {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'missing_fields' });
    await generate(req, res, WORLD_GEN_SYSTEM, `Create a world based on this description: ${description}`);
});

// POST /world/refine
router.post('/world/refine', async (req, res) => {
    const { draft, section, instruction } = req.body;
    if (!draft || !section || !instruction) return res.status(400).json({ error: 'missing_fields' });
    const userContent = `Current world card:\n${JSON.stringify(draft)}\n\nRefine the "${section}" section with this instruction: ${instruction}`;
    await generate(req, res, WORLD_REFINE_SYSTEM(section), userContent);
});

// POST /character
router.post('/character', async (req, res) => {
    const { description, worldContext } = req.body;
    if (!description) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = worldContext ? `\nWorld power system: ${JSON.stringify(worldContext.power_system)}` : '';
    await generate(req, res, CHAR_GEN_SYSTEM, `Create a character based on this description: ${description}${worldInfo}`);
});

// POST /character/refine
router.post('/character/refine', async (req, res) => {
    const { draft, section, instruction } = req.body;
    if (!draft || !section || !instruction) return res.status(400).json({ error: 'missing_fields' });
    const userContent = `Current character card:\n${JSON.stringify(draft)}\n\nRefine the "${section}" section: ${instruction}`;
    const system = `You are a character creation assistant. Update only the "${section}" section and return the complete character card JSON. Respond only with valid JSON.`;
    await generate(req, res, system, userContent);
});
```

- [ ] **Step 4: Run tests**

Run: `npm run test:ws`
Expected: All generate tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/generate.js tests/world-simulation/generate.test.js
git commit -m "feat(world-sim): card generation endpoints for world and character"
```

---

## Task 12: Mount Router + Full Test Run

**Files:**
- Modify: `src/server-startup.js`

- [ ] **Step 1: Mount world-simulation router in server-startup.js**

Add to the imports at the top of `src/server-startup.js`:
```js
import { router as worldSimRouter } from './endpoints/world-simulation/index.js';
```

Add to `setupPrivateEndpoints()` function, after the existing `app.use` calls:
```js
app.use('/api/world-sim', worldSimRouter);
```

- [ ] **Step 2: Run the full test suite**

Run: `npm run test:ws`
Expected: All tests PASS — check for any failures and fix before proceeding.

- [ ] **Step 3: Start the server and manually verify the health endpoint**

Run: `npm start`

In another terminal: `curl http://localhost:8000/api/world-sim/health`
Expected: `{"ok":true}`

Stop the server with Ctrl+C.

- [ ] **Step 4: Final commit**

```bash
git add src/server-startup.js
git commit -m "feat(world-sim): mount world-simulation router on /api/world-sim"
```

---

## Plan Complete

All backend endpoints for the world simulator are now implemented and tested. The next plan (Plan 2) covers the React frontend: app setup, routing, stores, and the world/character card creation wizard.
