# World Simulator Frontend — Implementation Plan 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add world/character CRUD backend endpoints, then build the React + Vite + Zustand + Tailwind CSS frontend covering the world list page, world creation wizard, and character creation wizard.

**Architecture:** Two small backend routers (`/worlds`, `/characters`) are added to the existing world-sim module. Vite project lives in `frontend/`; `vite.config.js` proxies `/api/*` to Express during dev, and `npm run build:frontend` outputs to `public/` for production. A catch-all SPA fallback in `server-main.js` serves `index.html` for all unmatched GET requests.

**Tech Stack:** Node.js 18 ESM (backend), React 18 + Vite 5, React Router v6, Zustand 4, Tailwind CSS 3, Vitest + @testing-library/react (frontend tests), existing Jest (backend tests)

---

## File Structure

### New backend files
- Create: `src/endpoints/world-simulation/storage/worlds.js` — file-backed world card CRUD
- Create: `src/endpoints/world-simulation/worlds.js` — `/worlds` Express router
- Create: `src/endpoints/world-simulation/storage/characters.js` — file-backed character CRUD
- Create: `src/endpoints/world-simulation/characters.js` — `/characters` Express router
- Modify: `src/endpoints/world-simulation/index.js` — mount worlds + characters routers
- Modify: `src/server-main.js` — add SPA fallback after static middleware
- Modify: `package.json` — add `build:frontend` script

### New frontend files
```
frontend/
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
  index.html
  src/
    main.jsx
    App.jsx
    index.css
    api/
      client.js          # fetch wrapper, error normalization
      worlds.js          # /api/world-sim/worlds calls + generate calls
      characters.js      # /api/world-sim/characters calls + generate calls
    stores/
      worldStore.js
      characterStore.js
      chatStore.js
      eventStore.js
      playerStore.js
      sceneStore.js
    pages/
      WorldListPage.jsx
      CreateWorldPage.jsx
      CreateCharacterPage.jsx
      WorldPage.jsx        # skeleton (full impl in Plan 3)
      SettingsPage.jsx     # skeleton
    components/
      ui/
        Button.jsx
        Spinner.jsx
      wizard/
        DraftBlock.jsx     # renders one AI-draft section + Refine button
        RefineDialog.jsx   # modal textarea for refinement prompt
  src/__tests__/
    api/client.test.js
    stores/worldStore.test.js
    stores/eventStore.test.js
    pages/WorldListPage.test.jsx
    pages/CreateWorldPage.test.jsx
    pages/CreateCharacterPage.test.jsx
```

### New test files (backend, Jest)
- Create: `tests/world-simulation/worlds.test.js`
- Create: `tests/world-simulation/characters.test.js`

---

## Task 1: Worlds Storage + Router

**Files:**
- Create: `src/endpoints/world-simulation/storage/worlds.js`
- Create: `src/endpoints/world-simulation/worlds.js`
- Modify: `src/endpoints/world-simulation/index.js`
- Test: `tests/world-simulation/worlds.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/world-simulation/worlds.test.js
import { jest } from '@jest/globals';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import fetch from 'node-fetch';
import { router } from '../../src/endpoints/world-simulation/worlds.js';
import { startTestServer } from './helpers.js';

let server, url, dirs;

beforeEach(async () => {
    const tmpDir = await mkdtemp(os.tmpdir() + '/ws-worlds-');
    dirs = { worlds: tmpDir };
    server = await startTestServer(router, dirs);
    url = server.url;
});

afterEach(async () => {
    await server.stop();
    await rm(dirs.worlds, { recursive: true });
});

test('GET /worlds returns empty array', async () => {
    const r = await fetch(`${url}/worlds`);
    const data = await r.json();
    expect(r.status).toBe(200);
    expect(data).toEqual([]);
});

test('POST /worlds creates a world, GET retrieves it', async () => {
    const world = { id: 'w1', name: 'Iron Fog' };
    const post = await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(world),
    });
    expect(post.status).toBe(201);

    const get = await fetch(`${url}/worlds/w1`);
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ id: 'w1', name: 'Iron Fog' });
});

test('PUT /worlds/:worldId updates a world', async () => {
    await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'w1', name: 'Iron Fog' }),
    });
    const put = await fetch(`${url}/worlds/w1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'w1', name: 'Iron Fog Updated' }),
    });
    expect(put.status).toBe(200);
    const data = await put.json();
    expect(data.name).toBe('Iron Fog Updated');
});

test('DELETE /worlds/:worldId removes world, GET returns 404', async () => {
    await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'w1', name: 'Iron Fog' }),
    });
    const del = await fetch(`${url}/worlds/w1`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    const get = await fetch(`${url}/worlds/w1`);
    expect(get.status).toBe(404);
});

test('POST /worlds returns 400 when id or name missing', async () => {
    const r = await fetch(`${url}/worlds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'No ID' }),
    });
    expect(r.status).toBe(400);
});
```

- [ ] **Step 2: Run to verify they fail**

```
npm run test:ws -- --testPathPattern=worlds
```
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implement `storage/worlds.js`**

```js
// src/endpoints/world-simulation/storage/worlds.js
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
```

- [ ] **Step 4: Implement `worlds.js` router**

```js
// src/endpoints/world-simulation/worlds.js
import express from 'express';
import { readWorld, writeWorld, listWorlds, deleteWorld } from './storage/worlds.js';

export const router = express.Router();

// GET /worlds — list all worlds
router.get('/', async (req, res) => {
    try {
        const worlds = await listWorlds(req.user.directories);
        res.json(worlds);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// GET /worlds/:worldId
router.get('/:worldId', async (req, res) => {
    try {
        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });
        res.json(world);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// POST /worlds — create
router.post('/', async (req, res) => {
    try {
        const world = req.body;
        if (!world?.id || !world?.name) return res.status(400).json({ error: 'missing_fields', required: ['id', 'name'] });
        await writeWorld(req.user.directories, world.id, world);
        res.status(201).json(world);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// PUT /worlds/:worldId — replace
router.put('/:worldId', async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        await writeWorld(req.user.directories, req.params.worldId, req.body);
        res.json(req.body);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

// DELETE /worlds/:worldId
router.delete('/:worldId', async (req, res) => {
    try {
        const world = await readWorld(req.user.directories, req.params.worldId);
        if (!world) return res.status(404).json({ error: 'world_not_found' });
        await deleteWorld(req.user.directories, req.params.worldId);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
```

- [ ] **Step 5: Mount in `index.js`**

Add to `src/endpoints/world-simulation/index.js`:
```js
import { router as worldsRouter } from './worlds.js';
// ...
router.use('/worlds', worldsRouter);
```

- [ ] **Step 6: Run tests to verify they pass**

```
npm run test:ws -- --testPathPattern=worlds
```
Expected: 5 PASS

- [ ] **Step 7: Commit**

```bash
git add src/endpoints/world-simulation/storage/worlds.js \
        src/endpoints/world-simulation/worlds.js \
        src/endpoints/world-simulation/index.js \
        tests/world-simulation/worlds.test.js
git commit -m "feat(world-sim): add worlds CRUD storage and router"
```

---

## Task 2: Characters Storage + Router

**Files:**
- Create: `src/endpoints/world-simulation/storage/characters.js`
- Create: `src/endpoints/world-simulation/characters.js`
- Modify: `src/endpoints/world-simulation/index.js`
- Test: `tests/world-simulation/characters.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/world-simulation/characters.test.js
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import fetch from 'node-fetch';
import { router } from '../../src/endpoints/world-simulation/characters.js';
import { startTestServer } from './helpers.js';

let server, url, dirs;

beforeEach(async () => {
    const tmpDir = await mkdtemp(os.tmpdir() + '/ws-chars-');
    dirs = { characters: tmpDir };
    server = await startTestServer(router, dirs);
    url = server.url;
});

afterEach(async () => {
    await server.stop();
    await rm(dirs.characters, { recursive: true });
});

test('GET /characters returns empty array initially', async () => {
    const r = await fetch(`${url}/characters`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
});

test('POST then GET a character by id', async () => {
    const char = { id: 'c1', name: 'Ada Walker', world_id: 'w1' };
    const post = await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(char),
    });
    expect(post.status).toBe(201);

    const get = await fetch(`${url}/characters/c1`);
    expect(get.status).toBe(200);
    expect((await get.json()).name).toBe('Ada Walker');
});

test('GET /characters?worldId filters by world', async () => {
    await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'c1', name: 'Ada', world_id: 'w1' }),
    });
    await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'c2', name: 'Bob', world_id: 'w2' }),
    });
    const r = await fetch(`${url}/characters?worldId=w1`);
    const data = await r.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('c1');
});

test('DELETE /characters/:id returns 204', async () => {
    await fetch(`${url}/characters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'c1', name: 'Ada', world_id: 'w1' }),
    });
    const del = await fetch(`${url}/characters/c1`, { method: 'DELETE' });
    expect(del.status).toBe(204);

    const get = await fetch(`${url}/characters/c1`);
    expect(get.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify they fail**

```
npm run test:ws -- --testPathPattern=characters
```
Expected: FAIL

- [ ] **Step 3: Implement `storage/characters.js`**

```js
// src/endpoints/world-simulation/storage/characters.js
import fs from 'node:fs';
import path from 'node:path';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';

function getPath(dirs, charId) {
    return path.join(dirs.characters, sanitize(`wc_${charId}.json`));
}

export async function readCharacter(dirs, charId) {
    try {
        const text = await fs.promises.readFile(getPath(dirs, charId), 'utf8');
        return JSON.parse(text);
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        return null;
    }
}

export async function writeCharacter(dirs, charId, data) {
    writeFileAtomicSync(getPath(dirs, charId), JSON.stringify(data, null, 2));
}

export async function listCharacters(dirs, worldId) {
    try {
        const files = await fs.promises.readdir(dirs.characters);
        const results = [];
        for (const f of files.filter(f => f.startsWith('wc_') && f.endsWith('.json'))) {
            try {
                const text = await fs.promises.readFile(path.join(dirs.characters, f), 'utf8');
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

export async function deleteCharacter(dirs, charId) {
    try {
        await fs.promises.unlink(getPath(dirs, charId));
    } catch (err) {
        if (err.code !== 'ENOENT') throw err;
    }
}
```

- [ ] **Step 4: Implement `characters.js` router**

```js
// src/endpoints/world-simulation/characters.js
import express from 'express';
import { readCharacter, writeCharacter, listCharacters, deleteCharacter } from './storage/characters.js';

export const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const chars = await listCharacters(req.user.directories, req.query.worldId || null);
        res.json(chars);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.get('/:charId', async (req, res) => {
    try {
        const char = await readCharacter(req.user.directories, req.params.charId);
        if (!char) return res.status(404).json({ error: 'character_not_found' });
        res.json(char);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.post('/', async (req, res) => {
    try {
        const char = req.body;
        if (!char?.id || !char?.name) return res.status(400).json({ error: 'missing_fields', required: ['id', 'name'] });
        await writeCharacter(req.user.directories, char.id, char);
        res.status(201).json(char);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.put('/:charId', async (req, res) => {
    try {
        if (!req.body?.name) return res.status(400).json({ error: 'missing_fields' });
        await writeCharacter(req.user.directories, req.params.charId, req.body);
        res.json(req.body);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});

router.delete('/:charId', async (req, res) => {
    try {
        const char = await readCharacter(req.user.directories, req.params.charId);
        if (!char) return res.status(404).json({ error: 'character_not_found' });
        await deleteCharacter(req.user.directories, req.params.charId);
        res.sendStatus(204);
    } catch (err) { console.error(err); res.status(500).json({ error: 'internal_error' }); }
});
```

- [ ] **Step 5: Mount in `index.js`**

```js
import { router as worldsRouter } from './worlds.js';
import { router as charactersRouter } from './characters.js';
// ...
router.use('/worlds', worldsRouter);
router.use('/characters', charactersRouter);
```

- [ ] **Step 6: Run all backend tests to confirm nothing is broken**

```
npm run test:ws
```
Expected: All PASS (existing 38 + new 9 = 47)

- [ ] **Step 7: Commit**

```bash
git add src/endpoints/world-simulation/storage/characters.js \
        src/endpoints/world-simulation/characters.js \
        src/endpoints/world-simulation/index.js \
        tests/world-simulation/characters.test.js
git commit -m "feat(world-sim): add characters CRUD storage and router"
```

---

## Task 3: Vite Project Bootstrap

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/pages/WorldListPage.jsx` (placeholder)
- Create: `frontend/src/pages/CreateWorldPage.jsx` (placeholder)
- Create: `frontend/src/pages/CreateCharacterPage.jsx` (placeholder)
- Create: `frontend/src/pages/WorldPage.jsx` (skeleton)
- Create: `frontend/src/pages/SettingsPage.jsx` (skeleton)

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "world-simulator-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vite": "^5.4.11",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
  },
});
```

- [ ] **Step 3: Create Tailwind + PostCSS config**

`frontend/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        parchment: '#f5f0e8',
        ink: '#1a1a2e',
      },
    },
  },
  plugins: [],
};
```

`frontend/postcss.config.js`:
```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>世界模拟器</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Create `frontend/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 7: Create placeholder pages and `App.jsx`**

```jsx
// frontend/src/pages/WorldListPage.jsx
export default function WorldListPage() { return <div>World List</div>; }

// frontend/src/pages/CreateWorldPage.jsx
export default function CreateWorldPage() { return <div>Create World</div>; }

// frontend/src/pages/CreateCharacterPage.jsx
export default function CreateCharacterPage() { return <div>Create Character</div>; }

// frontend/src/pages/WorldPage.jsx  (skeleton for Plan 3)
export default function WorldPage() { return <div>World — coming in Plan 3</div>; }

// frontend/src/pages/SettingsPage.jsx
export default function SettingsPage() { return <div>Settings — coming in Plan 3</div>; }
```

```jsx
// frontend/src/App.jsx
import { Routes, Route } from 'react-router-dom';
import WorldListPage from './pages/WorldListPage.jsx';
import CreateWorldPage from './pages/CreateWorldPage.jsx';
import CreateCharacterPage from './pages/CreateCharacterPage.jsx';
import WorldPage from './pages/WorldPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorldListPage />} />
      <Route path="/create/world" element={<CreateWorldPage />} />
      <Route path="/create/character" element={<CreateCharacterPage />} />
      <Route path="/world/:worldId" element={<WorldPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
```

- [ ] **Step 8: Create test setup file**

```js
// frontend/src/__tests__/setup.js
import '@testing-library/jest-dom';
```

- [ ] **Step 9: Install dependencies and verify dev server starts**

```bash
cd frontend && npm install
npm run dev
```
Expected: Vite dev server starts on port 5173, no errors. Press Ctrl+C to stop.

- [ ] **Step 10: Run frontend tests (should pass trivially)**

```bash
cd frontend && npm test
```
Expected: No test files yet, 0 tests.

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "feat(frontend): bootstrap Vite + React + Tailwind project"
```

---

## Task 4: API Client Layer + Zustand Stores

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/api/worlds.js`
- Create: `frontend/src/api/characters.js`
- Create: `frontend/src/stores/worldStore.js`
- Create: `frontend/src/stores/characterStore.js`
- Create: `frontend/src/stores/chatStore.js`
- Create: `frontend/src/stores/eventStore.js`
- Create: `frontend/src/stores/playerStore.js`
- Create: `frontend/src/stores/sceneStore.js`
- Test: `frontend/src/__tests__/api/client.test.js`
- Test: `frontend/src/__tests__/stores/worldStore.test.js`
- Test: `frontend/src/__tests__/stores/eventStore.test.js`

- [ ] **Step 1: Write failing tests for API client**

```js
// frontend/src/__tests__/api/client.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, ApiError } from '../../api/client.js';

beforeEach(() => { vi.restoreAllMocks(); });

describe('apiFetch', () => {
  it('returns parsed JSON on 200', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    const result = await apiFetch('/api/world-sim/health');
    expect(result).toEqual({ ok: true });
  });

  it('throws ApiError with status on 404', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'world_not_found' }),
    });
    await expect(apiFetch('/api/world-sim/worlds/bad')).rejects.toThrow(ApiError);
    await expect(apiFetch('/api/world-sim/worlds/bad')).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError with status 502 on LLM failure', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'llm_unavailable' }),
    });
    await expect(apiFetch('/api/world-sim/generate/world', { method: 'POST', body: '{}' }))
      .rejects.toMatchObject({ status: 502 });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npm test -- client
```
Expected: FAIL "Cannot find module"

- [ ] **Step 3: Implement `api/client.js`**

```js
// frontend/src/api/client.js
export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}
```

- [ ] **Step 4: Implement `api/worlds.js`**

```js
// frontend/src/api/worlds.js
import { apiFetch } from './client.js';

const BASE = '/api/world-sim';

export const worldsApi = {
  list: () => apiFetch(`${BASE}/worlds`),
  get: (id) => apiFetch(`${BASE}/worlds/${id}`),
  create: (world) => apiFetch(`${BASE}/worlds`, { method: 'POST', body: JSON.stringify(world) }),
  update: (id, world) => apiFetch(`${BASE}/worlds/${id}`, { method: 'PUT', body: JSON.stringify(world) }),
  delete: (id) => apiFetch(`${BASE}/worlds/${id}`, { method: 'DELETE' }),

  generateDraft: (description, apiConfig) =>
    apiFetch(`${BASE}/generate/world`, { method: 'POST', body: JSON.stringify({ description, apiConfig }) }),

  refineDraft: (draft, section, additionalDescription, apiConfig) =>
    apiFetch(`${BASE}/generate/world/refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, additionalDescription, apiConfig }),
    }),
};
```

- [ ] **Step 5: Implement `api/characters.js`**

```js
// frontend/src/api/characters.js
import { apiFetch } from './client.js';

const BASE = '/api/world-sim';

export const charactersApi = {
  list: (worldId) => apiFetch(`${BASE}/characters?worldId=${worldId}`),
  get: (id) => apiFetch(`${BASE}/characters/${id}`),
  create: (char) => apiFetch(`${BASE}/characters`, { method: 'POST', body: JSON.stringify(char) }),
  update: (id, char) => apiFetch(`${BASE}/characters/${id}`, { method: 'PUT', body: JSON.stringify(char) }),
  delete: (id) => apiFetch(`${BASE}/characters/${id}`, { method: 'DELETE' }),

  generateDraft: (worldId, description, apiConfig) =>
    apiFetch(`${BASE}/generate/character`, { method: 'POST', body: JSON.stringify({ worldId, description, apiConfig }) }),

  refineDraft: (draft, section, additionalDescription, apiConfig) =>
    apiFetch(`${BASE}/generate/character/refine`, {
      method: 'POST',
      body: JSON.stringify({ draft, section, additionalDescription, apiConfig }),
    }),
};
```

- [ ] **Step 6: Write failing store tests**

```js
// frontend/src/__tests__/stores/worldStore.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorldStore } from '../../stores/worldStore.js';

// Reset store between tests
beforeEach(() => {
  useWorldStore.setState({ worlds: [], currentWorld: null, narrativeMode: 'ensemble', loading: false, error: null });
});

describe('worldStore', () => {
  it('setWorlds updates the worlds list', () => {
    const { setWorlds } = useWorldStore.getState();
    setWorlds([{ id: 'w1', name: 'Iron Fog' }]);
    expect(useWorldStore.getState().worlds).toHaveLength(1);
  });

  it('setCurrentWorld updates currentWorld', () => {
    const world = { id: 'w1', name: 'Iron Fog' };
    useWorldStore.getState().setCurrentWorld(world);
    expect(useWorldStore.getState().currentWorld).toEqual(world);
  });

  it('setNarrativeMode updates mode', () => {
    useWorldStore.getState().setNarrativeMode('epic');
    expect(useWorldStore.getState().narrativeMode).toBe('epic');
  });
});
```

```js
// frontend/src/__tests__/stores/eventStore.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore } from '../../stores/eventStore.js';

beforeEach(() => {
  useEventStore.setState({ events: [], pendingProposal: null, proposing: false, turnsSinceLastPropose: 0 });
});

describe('eventStore', () => {
  it('incrementTurns increments the counter', () => {
    useEventStore.getState().incrementTurns();
    useEventStore.getState().incrementTurns();
    expect(useEventStore.getState().turnsSinceLastPropose).toBe(2);
  });

  it('setPendingProposal sets the proposal and resets counter', () => {
    useEventStore.getState().incrementTurns();
    useEventStore.getState().incrementTurns();
    useEventStore.getState().incrementTurns();
    useEventStore.getState().setPendingProposal({ narrative: 'Something happened', event_draft: { id: 'e1' } });
    expect(useEventStore.getState().pendingProposal).toBeTruthy();
    expect(useEventStore.getState().turnsSinceLastPropose).toBe(0);
  });

  it('clearProposal removes pending proposal', () => {
    useEventStore.getState().setPendingProposal({ narrative: 'X', event_draft: {} });
    useEventStore.getState().clearProposal();
    expect(useEventStore.getState().pendingProposal).toBeNull();
  });

  it('shouldPropose returns true only when turns >= 3 and not proposing and no pending', () => {
    expect(useEventStore.getState().shouldPropose()).toBe(false);
    useEventStore.setState({ turnsSinceLastPropose: 3 });
    expect(useEventStore.getState().shouldPropose()).toBe(true);
    useEventStore.setState({ proposing: true });
    expect(useEventStore.getState().shouldPropose()).toBe(false);
  });
});
```

- [ ] **Step 7: Run to verify they fail**

```bash
cd frontend && npm test -- stores
```
Expected: FAIL

- [ ] **Step 8: Implement all 6 stores**

```js
// frontend/src/stores/worldStore.js
import { create } from 'zustand';

export const useWorldStore = create((set) => ({
  worlds: [],
  currentWorld: null,
  narrativeMode: 'ensemble', // 'intimate' | 'ensemble' | 'epic'
  loading: false,
  error: null,
  setWorlds: (worlds) => set({ worlds }),
  setCurrentWorld: (world) => set({ currentWorld: world }),
  setNarrativeMode: (mode) => set({ narrativeMode: mode }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
```

```js
// frontend/src/stores/characterStore.js
import { create } from 'zustand';

export const useCharacterStore = create((set) => ({
  characters: [],
  activeCharacters: [], // chars in current scene
  setCharacters: (characters) => set({ characters }),
  setActiveCharacters: (activeCharacters) => set({ activeCharacters }),
}));
```

```js
// frontend/src/stores/chatStore.js
import { create } from 'zustand';

export const useChatStore = create((set) => ({
  messages: [],
  streaming: false,
  currentWorldId: null,
  setMessages: (messages) => set({ messages }),
  appendMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setStreaming: (streaming) => set({ streaming }),
  setCurrentWorldId: (id) => set({ currentWorldId: id }),
}));
```

```js
// frontend/src/stores/eventStore.js
import { create } from 'zustand';

export const useEventStore = create((set, get) => ({
  events: [],
  pendingProposal: null,
  proposing: false,
  turnsSinceLastPropose: 0,

  setEvents: (events) => set({ events }),
  incrementTurns: () => set((s) => ({ turnsSinceLastPropose: s.turnsSinceLastPropose + 1 })),
  setPendingProposal: (proposal) => set({ pendingProposal: proposal, turnsSinceLastPropose: 0 }),
  clearProposal: () => set({ pendingProposal: null }),
  setProposing: (proposing) => set({ proposing }),

  shouldPropose: () => {
    const { turnsSinceLastPropose, proposing, pendingProposal } = get();
    return turnsSinceLastPropose >= 3 && !proposing && !pendingProposal;
  },
}));
```

```js
// frontend/src/stores/playerStore.js
import { create } from 'zustand';

export const usePlayerStore = create((set) => ({
  player: null,
  setPlayer: (player) => set({ player }),
  updateStatus: (status) => set((s) => ({ player: s.player ? { ...s.player, status: { ...s.player.status, ...status } } : null })),
}));
```

```js
// frontend/src/stores/sceneStore.js
import { create } from 'zustand';

export const useSceneStore = create((set) => ({
  scenes: [],
  currentScene: null,
  setScenes: (scenes) => set({ scenes }),
  setCurrentScene: (scene) => set({ currentScene: scene }),
}));
```

- [ ] **Step 9: Run all frontend tests**

```bash
cd frontend && npm test
```
Expected: All PASS (client + store tests)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api/ frontend/src/stores/ frontend/src/__tests__/
git commit -m "feat(frontend): API client layer and Zustand stores"
```

---

## Task 5: Express SPA Fallback + Build Script

**Files:**
- Modify: `src/server-main.js`
- Modify: `package.json`

- [ ] **Step 1: Add SPA fallback to `server-main.js`**

Read the file first, then add after the `setupPrivateEndpoints(app)` call (around line 269):

```js
// SPA fallback: serve index.html for all non-API, non-file GET requests
app.get('*', (req, res) => {
    res.sendFile(path.join(serverDirectory, 'public', 'index.html'));
});
```

The insertion point is after the line `setupPrivateEndpoints(app);`. Use the Edit tool to add this block.

- [ ] **Step 2: Add `build:frontend` script to root `package.json`**

In the `scripts` object, add:
```json
"build:frontend": "cd frontend && npm run build"
```

- [ ] **Step 3: Verify build works**

```bash
npm run build:frontend
```
Expected: Vite build succeeds, `public/index.html` and assets created. (Note: this will overwrite existing SillyTavern public files — confirm this is intentional before running.)

- [ ] **Step 4: Commit**

```bash
git add src/server-main.js package.json
git commit -m "feat: add SPA fallback and build:frontend script"
```

---

## Task 6: World List Page

**Files:**
- Modify: `frontend/src/pages/WorldListPage.jsx`
- Create: `frontend/src/components/ui/Button.jsx`
- Create: `frontend/src/components/ui/Spinner.jsx`
- Test: `frontend/src/__tests__/pages/WorldListPage.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// frontend/src/__tests__/pages/WorldListPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import WorldListPage from '../../pages/WorldListPage.jsx';
import * as worldsApiModule from '../../api/worlds.js';

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage() {
  return render(<MemoryRouter><WorldListPage /></MemoryRouter>);
}

it('shows loading then list of worlds', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockResolvedValue([
    { id: 'w1', name: 'Iron Fog', foundation: { background: 'A dark city' } },
  ]);
  renderPage();
  expect(screen.getByRole('status')).toBeInTheDocument(); // spinner
  await waitFor(() => expect(screen.getByText('Iron Fog')).toBeInTheDocument());
});

it('shows empty state when no worlds', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockResolvedValue([]);
  renderPage();
  await waitFor(() => expect(screen.getByText(/还没有世界/)).toBeInTheDocument());
});

it('shows error message on API failure', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockRejectedValue(new Error('network error'));
  renderPage();
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
});

it('navigates to /create/world when clicking the create button', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'list').mockResolvedValue([]);
  const { container } = renderPage();
  await waitFor(() => screen.getByText(/创建新世界/));
  // Button exists and has the right link
  const link = screen.getByRole('link', { name: /创建新世界/ });
  expect(link.getAttribute('href')).toBe('/create/world');
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npm test -- WorldListPage
```
Expected: FAIL

- [ ] **Step 3: Implement `Button.jsx` and `Spinner.jsx`**

```jsx
// frontend/src/components/ui/Button.jsx
export default function Button({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center justify-center px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variants = {
    primary: 'bg-ink text-white hover:bg-ink/80 focus:ring-ink',
    secondary: 'bg-parchment text-ink border border-ink/20 hover:bg-ink/5 focus:ring-ink',
    ghost: 'text-ink hover:bg-ink/5 focus:ring-ink',
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}
```

```jsx
// frontend/src/components/ui/Spinner.jsx
export default function Spinner() {
  return (
    <div role="status" aria-label="加载中" className="flex justify-center py-8">
      <div className="w-8 h-8 border-4 border-ink/20 border-t-ink rounded-full animate-spin" />
    </div>
  );
}
```

- [ ] **Step 4: Implement `WorldListPage.jsx`**

```jsx
// frontend/src/pages/WorldListPage.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import Spinner from '../components/ui/Spinner.jsx';
import Button from '../components/ui/Button.jsx';

export default function WorldListPage() {
  const [worlds, setWorlds] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    worldsApi.list()
      .then(setWorlds)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-parchment flex items-center justify-center">
        <div role="alert" className="text-red-600 text-center">
          <p className="font-medium">加载失败</p>
          <p className="text-sm">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => window.location.reload()}>重试</Button>
        </div>
      </div>
    );
  }

  if (worlds === null) {
    return <div className="min-h-screen bg-parchment"><Spinner /></div>;
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">世界模拟器</h1>
        <Link
          to="/create/world"
          className="inline-flex items-center px-4 py-2 bg-ink text-parchment rounded-md font-medium hover:bg-ink/80 transition-colors"
        >
          创建新世界
        </Link>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {worlds.length === 0 ? (
          <div className="text-center py-16 text-ink/50">
            <p className="text-lg">还没有世界</p>
            <p className="text-sm mt-2">点击右上角「创建新世界」开始</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((world) => (
              <button
                key={world.id}
                onClick={() => navigate(`/world/${world.id}`)}
                className="text-left p-5 bg-white rounded-lg border border-ink/10 hover:border-ink/30 hover:shadow-md transition-all"
              >
                <h2 className="font-bold text-ink text-lg">{world.name}</h2>
                {world.foundation?.background && (
                  <p className="text-ink/60 text-sm mt-1 line-clamp-2">{world.foundation.background}</p>
                )}
                <p className="text-ink/40 text-xs mt-3">{new Date(world.created_at || 0).toLocaleDateString('zh-CN')}</p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npm test -- WorldListPage
```
Expected: 4 PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/WorldListPage.jsx \
        frontend/src/components/ui/Button.jsx \
        frontend/src/components/ui/Spinner.jsx \
        frontend/src/__tests__/pages/WorldListPage.test.jsx
git commit -m "feat(frontend): world list page with loading and empty states"
```

---

## Task 7: Wizard Shared Components

**Files:**
- Create: `frontend/src/components/wizard/DraftBlock.jsx`
- Create: `frontend/src/components/wizard/RefineDialog.jsx`

No dedicated tests for these tiny presentational components — they are tested indirectly through the wizard page tests in Tasks 8 and 9.

- [ ] **Step 1: Implement `DraftBlock.jsx`**

```jsx
// frontend/src/components/wizard/DraftBlock.jsx
import Button from '../ui/Button.jsx';

/**
 * Renders one section of an AI-generated draft.
 * @param {string} title - Section heading
 * @param {any} content - Rendered as JSON or string
 * @param {string} sectionKey - Key passed to onRefine
 * @param {function} onRefine - Called with sectionKey when Refine clicked
 * @param {boolean} loading - Shows spinner on refine button
 */
export default function DraftBlock({ title, content, sectionKey, onRefine, loading = false }) {
  const display = typeof content === 'object' ? JSON.stringify(content, null, 2) : String(content ?? '');

  return (
    <div className="border border-ink/10 rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-ink">{title}</h3>
        <Button
          variant="ghost"
          className="text-sm"
          onClick={() => onRefine(sectionKey)}
          disabled={loading}
        >
          {loading ? '细化中…' : '细化'}
        </Button>
      </div>
      <pre className="text-sm text-ink/70 whitespace-pre-wrap font-sans">{display}</pre>
    </div>
  );
}
```

- [ ] **Step 2: Implement `RefineDialog.jsx`**

```jsx
// frontend/src/components/wizard/RefineDialog.jsx
import { useState } from 'react';
import Button from '../ui/Button.jsx';

/**
 * Modal dialog for entering additional description to refine a draft section.
 * @param {string} sectionTitle - Name of section being refined
 * @param {function} onConfirm - Called with the text when confirmed
 * @param {function} onCancel - Called when dialog is dismissed
 */
export default function RefineDialog({ sectionTitle, onConfirm, onCancel }) {
  const [text, setText] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-bold text-ink mb-1">细化：{sectionTitle}</h2>
        <p className="text-sm text-ink/50 mb-3">告诉 AI 你想如何调整这一部分</p>
        <textarea
          className="w-full border border-ink/20 rounded-md p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink/30"
          rows={4}
          placeholder="例如：让这个世界更加黑暗压抑，增加工业污染的描写…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="secondary" onClick={onCancel}>取消</Button>
          <Button onClick={() => onConfirm(text)} disabled={!text.trim()}>确认细化</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/wizard/
git commit -m "feat(frontend): add wizard shared components DraftBlock and RefineDialog"
```

---

## Task 8: World Creation Wizard

**Files:**
- Modify: `frontend/src/pages/CreateWorldPage.jsx`
- Test: `frontend/src/__tests__/pages/CreateWorldPage.test.jsx`

**Flow:**
1. User types free description → clicks Generate
2. API call to `/generate/world` → returns draft with sections: `foundation`, `power_system`, `current_state`
3. Each section rendered as a `DraftBlock`
4. User clicks "细化" on any section → `RefineDialog` opens → user enters prompt → API call to `/generate/world/refine`
5. User clicks "确认创建" → saves via `/worlds` POST → navigates to world page

- [ ] **Step 1: Write failing tests**

```jsx
// frontend/src/__tests__/pages/CreateWorldPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import CreateWorldPage from '../../pages/CreateWorldPage.jsx';
import * as worldsApiModule from '../../api/worlds.js';

const mockDraft = {
  id: 'world_test',
  name: '铁雾城邦',
  foundation: { background: '工业蒸汽城市', geography: '北方高原', rules: '机械法则' },
  power_system: { description: '工程师阶层', tiers: [], constraints: '无', notes: '' },
  current_state: { summary: '动荡时期', key_tensions: [], recent_changes: '' },
};

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage() {
  return render(<MemoryRouter><CreateWorldPage /></MemoryRouter>);
}

it('shows description textarea and generate button initially', () => {
  renderPage();
  expect(screen.getByPlaceholderText(/描述/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /生成世界/ })).toBeInTheDocument();
});

it('shows draft sections after generation', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'generateDraft').mockResolvedValue({ draft: mockDraft });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述/), '一个工业蒸汽城市');
  await userEvent.click(screen.getByRole('button', { name: /生成世界/ }));
  await waitFor(() => expect(screen.getByText('基础设定')).toBeInTheDocument());
  expect(screen.getByText('力量体系')).toBeInTheDocument();
});

it('shows RefineDialog when Refine button is clicked', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'generateDraft').mockResolvedValue({ draft: mockDraft });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述/), '一个工业城市');
  await userEvent.click(screen.getByRole('button', { name: /生成世界/ }));
  await waitFor(() => screen.getByText('基础设定'));

  const refineButtons = screen.getAllByRole('button', { name: '细化' });
  await userEvent.click(refineButtons[0]);
  expect(screen.getByText(/细化：/)).toBeInTheDocument();
});

it('shows error message when generation fails', async () => {
  vi.spyOn(worldsApiModule.worldsApi, 'generateDraft').mockRejectedValue({ status: 502, message: 'llm_unavailable' });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述/), '描述');
  await userEvent.click(screen.getByRole('button', { name: /生成世界/ }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npm test -- CreateWorldPage
```
Expected: FAIL

- [ ] **Step 3: Implement `CreateWorldPage.jsx`**

```jsx
// frontend/src/pages/CreateWorldPage.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { randomUUID } from '../lib/uuid.js';
import { worldsApi } from '../api/worlds.js';
import DraftBlock from '../components/wizard/DraftBlock.jsx';
import RefineDialog from '../components/wizard/RefineDialog.jsx';
import Button from '../components/ui/Button.jsx';

const SECTION_LABELS = {
  foundation: '基础设定',
  power_system: '力量体系',
  current_state: '当前状态',
};

export default function CreateWorldPage() {
  const navigate = useNavigate();
  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [refiningSection, setRefiningSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const { draft: d } = await worldsApi.generateDraft(description);
      setDraft(d);
    } catch (err) {
      setError(err.status === 502 ? 'AI 服务暂时不可用，请稍后重试' : '生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRefineConfirm(additionalDescription) {
    const section = refiningSection;
    setRefiningSection(null);
    setDraft((prev) => ({ ...prev, _refining: section }));
    try {
      const { draft: refined } = await worldsApi.refineDraft(draft, section, additionalDescription);
      setDraft(refined);
    } catch (err) {
      setError('细化失败，请重试');
      setDraft((prev) => { const d = { ...prev }; delete d._refining; return d; });
    }
  }

  async function handleCreate() {
    if (!draft) return;
    setSaving(true);
    try {
      const { _refining, ...cleanDraft } = draft;
      const worldToSave = { ...cleanDraft, id: cleanDraft.id || randomUUID(), created_at: new Date().toISOString() };
      await worldsApi.create(worldToSave);
      navigate(`/world/${worldToSave.id}`);
    } catch (err) {
      setError('保存失败，请重试');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate('/')} className="text-ink/50 hover:text-ink text-sm">← 返回</button>
        <h1 className="text-lg font-bold text-ink">创建新世界</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {!draft ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-ink font-medium">描述你的世界</span>
              <p className="text-sm text-ink/50 mt-1">自由描述即可，AI 会帮你整理成完整的世界设定</p>
              <textarea
                className="mt-2 w-full border border-ink/20 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink/30 bg-white"
                rows={6}
                placeholder="描述你想要的世界…例如：一个以蒸汽动力为主的工业城邦，贫富差距极大，底层工人正在酝酿革命…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Button onClick={handleGenerate} disabled={generating || !description.trim()}>
              {generating ? '生成中…' : '生成世界'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-ink/50">对任意区块点击「细化」可以追加描述，让 AI 重新调整该部分</p>
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <DraftBlock
                key={key}
                title={label}
                content={draft[key]}
                sectionKey={key}
                onRefine={setRefiningSection}
                loading={draft._refining === key}
              />
            ))}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? '保存中…' : '确认创建'}
              </Button>
              <Button variant="secondary" onClick={() => setDraft(null)}>重新生成</Button>
            </div>
          </div>
        )}
      </main>

      {refiningSection && (
        <RefineDialog
          sectionTitle={SECTION_LABELS[refiningSection]}
          onConfirm={handleRefineConfirm}
          onCancel={() => setRefiningSection(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/lib/uuid.js`**

```js
// frontend/src/lib/uuid.js
export function randomUUID() {
  return crypto.randomUUID();
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend && npm test -- CreateWorldPage
```
Expected: 4 PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CreateWorldPage.jsx \
        frontend/src/lib/uuid.js \
        frontend/src/__tests__/pages/CreateWorldPage.test.jsx
git commit -m "feat(frontend): world creation wizard with AI generation and refine loop"
```

---

## Task 9: Character Creation Wizard

**Files:**
- Modify: `frontend/src/pages/CreateCharacterPage.jsx`
- Test: `frontend/src/__tests__/pages/CreateCharacterPage.test.jsx`

**Flow:** Same pattern as world creation, but uses `charactersApi`. Requires a `worldId` query param (`/create/character?worldId=xxx`). Sections: `identity`, `power_tier`, `current_state`.

- [ ] **Step 1: Write failing tests**

```jsx
// frontend/src/__tests__/pages/CreateCharacterPage.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreateCharacterPage from '../../pages/CreateCharacterPage.jsx';
import * as charsApiModule from '../../api/characters.js';

const mockCharDraft = {
  id: 'char_test',
  name: '艾达·沃克',
  world_id: 'w1',
  identity: { background: '机械师', role: '反抗军工程师', personality: '坚韧' },
  power_tier: { level: 2, name: '技师', notes: '擅长机械' },
  current_state: { location: 'scene_001', goal: '推翻压迫', secrets: '前贵族' },
};

beforeEach(() => { vi.restoreAllMocks(); });

function renderPage(worldId = 'w1') {
  return render(
    <MemoryRouter initialEntries={[`/create/character?worldId=${worldId}`]}>
      <Routes>
        <Route path="/create/character" element={<CreateCharacterPage />} />
      </Routes>
    </MemoryRouter>
  );
}

it('shows description textarea and generate button', () => {
  renderPage();
  expect(screen.getByPlaceholderText(/描述/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /生成角色/ })).toBeInTheDocument();
});

it('shows draft sections after generation', async () => {
  vi.spyOn(charsApiModule.charactersApi, 'generateDraft').mockResolvedValue({ draft: mockCharDraft });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述/), '一个坚韧的女机械师');
  await userEvent.click(screen.getByRole('button', { name: /生成角色/ }));
  await waitFor(() => expect(screen.getByText('基本身份')).toBeInTheDocument());
  expect(screen.getByText('力量等级')).toBeInTheDocument();
});

it('shows error alert on 502', async () => {
  vi.spyOn(charsApiModule.charactersApi, 'generateDraft').mockRejectedValue({ status: 502 });
  renderPage();
  await userEvent.type(screen.getByPlaceholderText(/描述/), '一个角色');
  await userEvent.click(screen.getByRole('button', { name: /生成角色/ }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd frontend && npm test -- CreateCharacterPage
```
Expected: FAIL

- [ ] **Step 3: Implement `CreateCharacterPage.jsx`**

```jsx
// frontend/src/pages/CreateCharacterPage.jsx
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { randomUUID } from '../lib/uuid.js';
import { charactersApi } from '../api/characters.js';
import DraftBlock from '../components/wizard/DraftBlock.jsx';
import RefineDialog from '../components/wizard/RefineDialog.jsx';
import Button from '../components/ui/Button.jsx';

const SECTION_LABELS = {
  identity: '基本身份',
  power_tier: '力量等级',
  current_state: '当前状态',
};

export default function CreateCharacterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const worldId = searchParams.get('worldId');

  const [description, setDescription] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [refiningSection, setRefiningSection] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const { draft: d } = await charactersApi.generateDraft(worldId, description);
      setDraft(d);
    } catch (err) {
      setError(err?.status === 502 ? 'AI 服务暂时不可用，请稍后重试' : '生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRefineConfirm(additionalDescription) {
    const section = refiningSection;
    setRefiningSection(null);
    setDraft((prev) => ({ ...prev, _refining: section }));
    try {
      const { draft: refined } = await charactersApi.refineDraft(draft, section, additionalDescription);
      setDraft(refined);
    } catch {
      setError('细化失败，请重试');
      setDraft((prev) => { const d = { ...prev }; delete d._refining; return d; });
    }
  }

  async function handleCreate() {
    if (!draft) return;
    setSaving(true);
    try {
      const { _refining, ...cleanDraft } = draft;
      const charToSave = { ...cleanDraft, id: cleanDraft.id || randomUUID(), world_id: worldId, created_at: new Date().toISOString() };
      await charactersApi.create(charToSave);
      navigate(worldId ? `/world/${worldId}` : '/');
    } catch {
      setError('保存失败，请重试');
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/10 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(worldId ? `/world/${worldId}` : '/')} className="text-ink/50 hover:text-ink text-sm">← 返回</button>
        <h1 className="text-lg font-bold text-ink">创建角色</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {!draft ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-ink font-medium">描述这个角色</span>
              <p className="text-sm text-ink/50 mt-1">AI 会参考当前世界的力量体系为角色分配合适的等级</p>
              <textarea
                className="mt-2 w-full border border-ink/20 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ink/30 bg-white"
                rows={5}
                placeholder="描述这个角色的概念、性格、背景…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Button onClick={handleGenerate} disabled={generating || !description.trim()}>
              {generating ? '生成中…' : '生成角色'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <DraftBlock
                key={key}
                title={label}
                content={draft[key]}
                sectionKey={key}
                onRefine={setRefiningSection}
                loading={draft._refining === key}
              />
            ))}
            <div className="flex gap-3 pt-2">
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? '保存中…' : '确认创建'}
              </Button>
              <Button variant="secondary" onClick={() => setDraft(null)}>重新生成</Button>
            </div>
          </div>
        )}
      </main>

      {refiningSection && (
        <RefineDialog
          sectionTitle={SECTION_LABELS[refiningSection]}
          onConfirm={handleRefineConfirm}
          onCancel={() => setRefiningSection(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- CreateCharacterPage
```
Expected: 3 PASS

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npm test
```
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CreateCharacterPage.jsx \
        frontend/src/__tests__/pages/CreateCharacterPage.test.jsx
git commit -m "feat(frontend): character creation wizard"
```

---

## Final Verification

- [ ] **Run all backend tests**

```bash
npm run test:ws
```
Expected: 47+ PASS (original 38 + worlds 5 + characters 4)

- [ ] **Run all frontend tests**

```bash
cd frontend && npm test
```
Expected: All PASS (client 3 + worldStore 3 + eventStore 4 + WorldListPage 4 + CreateWorldPage 4 + CreateCharacterPage 3 = ~21)

- [ ] **Build the frontend**

```bash
npm run build:frontend
```
Expected: Clean build, files output to `public/`

- [ ] **Final commit (if anything loose)**

```bash
git status
# commit any remaining changes
```
