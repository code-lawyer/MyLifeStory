# Electron Packaging Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package MyLifeStory as a native desktop application using Electron. Users double-click an installer, the app starts the embedded Express server automatically, and a BrowserWindow opens to the app. On first launch (or when API is not configured), a setup overlay prompts the user to connect their LLM API before proceeding.

**Architecture:**
- `electron/main.js` — Electron main process (CommonJS). Starts the Express server in-process via dynamic `import('../server.js')`, waits for health check, opens BrowserWindow.
- `electron/package.json` — sets `"type": "commonjs"` to isolate Electron main from the root ESM context.
- `frontend/src/components/ApiSetupGuard.jsx` — wraps the entire React app; shows an API configuration overlay when no `apiKey` is stored, blocks navigation until configured.
- `electron-builder.yml` — produces NSIS installer (Windows), DMG (macOS), AppImage (Linux).

**Data directory:** In packaged app, data is stored in `app.getPath('userData')/data` (e.g. `%AppData%\MyLifeStory\data` on Windows). In dev mode, falls back to `./data`. Passed to server via `--dataRoot` CLI argument, which `CommandLineParser` already supports.

**Port:** `8768` — fixed, passed via `--port` CLI arg, avoids collision with common dev ports.

**Tech Stack:** Electron 34, electron-builder 25, React (frontend unchanged)

---

## File Map

| File | Change |
|------|--------|
| `electron/package.json` | New — `"type": "commonjs"` override |
| `electron/main.js` | New — Electron main process |
| `frontend/src/components/ApiSetupGuard.jsx` | New — API setup overlay |
| `frontend/src/App.jsx` | Wrap routes with `ApiSetupGuard` |
| `electron-builder.yml` | New — build config |
| `package.json` | Add electron devDep, add `electron:dev` + `electron:build` scripts |

---

## Task 1: Install Electron and scaffold main process

**Files:**
- Create: `electron/package.json`
- Create: `electron/main.js`
- Modify: `package.json`

- [ ] **Step 1: Install electron and electron-builder**

```bash
npm install --save-dev electron@34 electron-builder@25
```

- [ ] **Step 2: Create `electron/package.json`**

Create file `electron/package.json`:

```json
{
  "type": "commonjs"
}
```

This overrides the root `"type": "module"` so Electron's main.js can use `require()` and dynamic `import()`.

- [ ] **Step 3: Create `electron/main.js`**

Create file `electron/main.js`:

```js
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');

const PORT = 8768;
const DEV_DATA_ROOT = path.join(__dirname, '..', 'data');
const PROD_DATA_ROOT = path.join(app.getPath('userData'), 'data');
const DATA_ROOT = app.isPackaged ? PROD_DATA_ROOT : DEV_DATA_ROOT;

let mainWindow = null;

// Inject CLI args before server.js reads them
process.argv.push('--dataRoot', DATA_ROOT, '--port', String(PORT), '--disableCsrf');

async function startServer() {
    try {
        await import('../server.js');
    } catch (err) {
        console.error('[electron] Failed to start server:', err);
        app.quit();
    }
}

function waitForServer(retries = 30) {
    return new Promise((resolve, reject) => {
        const attempt = (n) => {
            http.get(`http://127.0.0.1:${PORT}/api/world-sim/health`, (res) => {
                if (res.statusCode === 200) return resolve();
                retry(n);
            }).on('error', () => retry(n));
        };
        const retry = (n) => {
            if (n <= 0) return reject(new Error('Server did not start in time'));
            setTimeout(() => attempt(n - 1), 500);
        };
        attempt(retries);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'MyLifeStory',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

    // Open external links in system browser, not in-app
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
    await startServer();
    await waitForServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 4: Add electron scripts to root `package.json`**

In `package.json`, add to the `"scripts"` section:

```json
"electron:dev": "electron electron/main.js",
"electron:build": "npm run build:frontend && electron-builder"
```

Also add the `"main"` field if it isn't pointing to `server.js` already for Electron's entry detection — electron-builder uses its own config, so this is fine as-is.

- [ ] **Step 5: Run dev mode to verify server starts**

```bash
npm run electron:dev 2>&1 | head -30
```

Expected: Electron window opens at `http://127.0.0.1:8768`, app loads. May show blank/error screen if API key is not set — that's addressed in Task 2.

---

## Task 2: First-launch API setup prompt

**Files:**
- Create: `frontend/src/components/ApiSetupGuard.jsx`
- Modify: `frontend/src/App.jsx`

The guard checks `settingsStore.apiKey` on mount. If empty, it renders a full-screen overlay instead of routing to the requested page. The overlay collects `apiUrl`, `apiKey`, `model`, tests the connection, and dismisses on success.

- [ ] **Step 1: Create `frontend/src/components/ApiSetupGuard.jsx`**

```jsx
import { useState } from 'react';
import { useSettingsStore } from '../stores/settingsStore.js';

export default function ApiSetupGuard({ children }) {
  const { apiKey, apiUrl, model, save } = useSettingsStore();
  const [dismissed, setDismissed] = useState(false);

  // Show overlay if no API key is stored and user hasn't manually dismissed
  const needsSetup = !apiKey && !dismissed;

  if (!needsSetup) return children;

  return (
    <>
      {children}
      <ApiSetupOverlay onDone={() => setDismissed(true)} />
    </>
  );
}

function ApiSetupOverlay({ onDone }) {
  const { save } = useSettingsStore();
  const [form, setForm] = useState({ apiUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o' });
  const [status, setStatus] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function testAndSave() {
    if (!form.apiUrl || !form.apiKey || !form.model) {
      setStatus('error');
      setErrorMsg('请填写所有字段');
      return;
    }
    setStatus('testing');
    try {
      const res = await fetch(`${form.apiUrl}/models`, {
        headers: { Authorization: `Bearer ${form.apiKey}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      save(form);
      setStatus('ok');
      setTimeout(onDone, 800);
    } catch (err) {
      setStatus('error');
      setErrorMsg(`连接失败：${err.message}`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-parchment border border-ink/20 rounded-xl shadow-2xl p-8 w-full max-w-md mx-4 space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-ink">连接 AI 接口</h2>
          <p className="text-sm text-ink/60 mt-1">首次使用需要配置 LLM API，应用的所有 AI 功能都依赖它。</p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-ink/50 uppercase tracking-wider">API 地址</span>
            <input
              className="mt-1 w-full px-3 py-2 text-sm bg-white/60 border border-ink/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-ink/40"
              value={form.apiUrl}
              onChange={e => set('apiUrl', e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink/50 uppercase tracking-wider">API Key</span>
            <input
              type="password"
              className="mt-1 w-full px-3 py-2 text-sm bg-white/60 border border-ink/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-ink/40"
              value={form.apiKey}
              onChange={e => set('apiKey', e.target.value)}
              placeholder="sk-..."
            />
          </label>
          <label className="block">
            <span className="text-xs text-ink/50 uppercase tracking-wider">模型</span>
            <input
              className="mt-1 w-full px-3 py-2 text-sm bg-white/60 border border-ink/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-ink/40"
              value={form.model}
              onChange={e => set('model', e.target.value)}
              placeholder="gpt-4o"
            />
          </label>
        </div>

        {status === 'error' && (
          <p className="text-xs text-red-500">{errorMsg}</p>
        )}
        {status === 'ok' && (
          <p className="text-xs text-green-600">连接成功，正在进入…</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            onClick={testAndSave}
            disabled={status === 'testing' || status === 'ok'}
            className="flex-1 px-4 py-2 text-sm bg-ink text-parchment rounded-lg disabled:opacity-50"
          >
            {status === 'testing' ? '测试中…' : '测试并保存'}
          </button>
          <button
            onClick={onDone}
            className="px-4 py-2 text-sm border border-ink/20 rounded-lg text-ink/60 hover:text-ink"
          >
            跳过
          </button>
        </div>
        <p className="text-[11px] text-ink/40 text-center">API Key 仅保存在本机，不会上传。</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wrap routes in `App.jsx` with `ApiSetupGuard`**

In `frontend/src/App.jsx`, change from:

```jsx
import { Routes, Route } from 'react-router-dom';
import WorldListPage from './pages/WorldListPage.jsx';
import CreateWorldPage from './pages/CreateWorldPage.jsx';
import CreateCharacterPage from './pages/CreateCharacterPage.jsx';
import WorldPage from './pages/WorldPage.jsx';
import SetupPage from './pages/SetupPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import WorldArchivePage from './pages/WorldArchivePage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorldListPage />} />
      <Route path="/create/world" element={<CreateWorldPage />} />
      <Route path="/create/character" element={<CreateCharacterPage />} />
      <Route path="/world/:worldId/setup" element={<SetupPage />} />
      <Route path="/world/:worldId" element={<WorldPage />} />
      <Route path="/world/:worldId/archive" element={<WorldArchivePage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
```

To:

```jsx
import { Routes, Route } from 'react-router-dom';
import WorldListPage from './pages/WorldListPage.jsx';
import CreateWorldPage from './pages/CreateWorldPage.jsx';
import CreateCharacterPage from './pages/CreateCharacterPage.jsx';
import WorldPage from './pages/WorldPage.jsx';
import SetupPage from './pages/SetupPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import WorldArchivePage from './pages/WorldArchivePage.jsx';
import ApiSetupGuard from './components/ApiSetupGuard.jsx';

export default function App() {
  return (
    <ApiSetupGuard>
      <Routes>
        <Route path="/" element={<WorldListPage />} />
        <Route path="/create/world" element={<CreateWorldPage />} />
        <Route path="/create/character" element={<CreateCharacterPage />} />
        <Route path="/world/:worldId/setup" element={<SetupPage />} />
        <Route path="/world/:worldId" element={<WorldPage />} />
        <Route path="/world/:worldId/archive" element={<WorldArchivePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </ApiSetupGuard>
  );
}
```

- [ ] **Step 3: Run frontend build to verify no errors**

```bash
cd frontend && npm run build 2>&1 | tail -10
```

Expected: `✓ built in ...` with no errors.

- [ ] **Step 4: Run electron:dev and verify setup overlay appears when no API key**

```bash
# Clear any existing settings first (or use a fresh profile)
npm run electron:dev
```

Expected: App opens, setup overlay appears over the world list. Entering valid API credentials and clicking "测试并保存" dismisses the overlay. Clicking "跳过" also dismisses it.

---

## Task 3: electron-builder configuration

**Files:**
- Create: `electron-builder.yml`

- [ ] **Step 1: Create `electron-builder.yml`**

```yaml
appId: com.mylifestory.app
productName: MyLifeStory
copyright: Copyright © 2026

main: electron/main.js

directories:
  output: dist-electron
  buildResources: build-resources

files:
  - electron/**/*
  - src/**/*
  - public/**/*
  - server.js
  - package.json
  - package-lock.json
  - node_modules/**/*
  - "!node_modules/.cache/**/*"
  - "!frontend/**/*"
  - "!tests/**/*"
  - "!docs/**/*"
  - "!data/**/*"
  - "!.git/**/*"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build-resources/icon.ico

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: build-resources/icon.icns
  category: public.app-category.games

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: build-resources/icon.png
  category: Game

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  installerLanguages: [zh_CN, en_US]
  language: 2052

publish: null
```

- [ ] **Step 2: Create placeholder icons directory**

```bash
mkdir -p build-resources
```

For now, add placeholder icon files (can be updated with real artwork later). The build will warn but still succeed without icons on some platforms.

If icons are missing, add a note to the plan — the build will need at minimum:
- `build-resources/icon.ico` (Windows, 256×256)
- `build-resources/icon.icns` (macOS)
- `build-resources/icon.png` (Linux, 512×512)

Icons can be generated from a single PNG using `electron-icon-builder` or an online converter.

- [ ] **Step 3: Run electron:build**

```bash
npm run electron:build 2>&1 | tail -20
```

Expected: `dist-electron/` contains installer for the current platform. No fatal errors.

---

## Task 4: Data persistence and path verification

This task verifies that user data is correctly stored in the OS user-data directory (not inside the app bundle) and survives app updates.

- [ ] **Step 1: Verify DATA_ROOT in packaged app**

In `electron/main.js`, `DATA_ROOT` resolves to:
- **Windows:** `%AppData%\MyLifeStory\data\`
- **macOS:** `~/Library/Application Support/MyLifeStory/data/`
- **Linux:** `~/.config/MyLifeStory/data/`

This matches `app.getPath('userData')` behaviour. Verify by adding a temporary `console.log('[electron] DATA_ROOT:', DATA_ROOT)` and checking the Electron DevTools console.

- [ ] **Step 2: Confirm `--disableCsrf` is appropriate**

CSRF protection guards against cross-site requests. In the Electron app:
- The BrowserWindow only loads `http://127.0.0.1:8768`
- No other origin can reach the server
- CSRF adds no meaningful security benefit in this context

`--disableCsrf` is correct for the Electron build. The web-served version (if any) should keep CSRF enabled.

- [ ] **Step 3: Verify localStorage persists between launches**

Electron stores localStorage in `app.getPath('userData')/Local Storage/`. API credentials saved in settings will survive restarts automatically — no extra work needed.

---

## Task 5: Final verification

- [ ] **Step 1: Full clean build**

```bash
npm run build:frontend && npm run electron:build 2>&1 | tail -15
```

Expected: installer produced in `dist-electron/`.

- [ ] **Step 2: Install and smoke test**

Install the generated `.exe` / `.dmg` / `.AppImage`. Verify:
- App opens without errors
- Setup overlay appears (fresh install = no localStorage)
- Entering API credentials and clicking "测试并保存" works
- Clicking "跳过" bypasses setup
- World creation and chat work end-to-end

- [ ] **Step 3: Commit**

```bash
git add electron/ electron-builder.yml build-resources/ frontend/src/components/ApiSetupGuard.jsx frontend/src/App.jsx package.json
git commit -m "feat: Electron packaging — desktop app with first-launch API setup"
```

---

## Notes

### Why `--disableCsrf` in Electron
The CSRF token mechanism in `frontend/src/api/csrf.js` fetches `/csrf-token` before each mutating request. In the packaged Electron app, this works fine but adds a round-trip per action. `--disableCsrf` removes this overhead with no security tradeoff (loopback-only server). The existing web mode keeps CSRF on.

### Port conflict handling
If port 8768 is taken, the server will fail to start and `waitForServer` will timeout after 15s. A future improvement: try port 8768, fall back to a random available port, and pass it to BrowserWindow via Electron IPC.

### API key security
API keys are stored in Electron's Chromium localStorage (`%AppData%\MyLifeStory\Local Storage\`). This is acceptable for a local single-user app. The key is never transmitted to any server other than the user-configured API endpoint.

### Icons
Before shipping, generate proper icons from a 1024×1024 PNG:
```bash
npx electron-icon-builder --input=icon-source.png --output=build-resources
```
