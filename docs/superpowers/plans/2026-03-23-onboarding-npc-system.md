# 引导流程 & NPC 分级系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现世界初始化引导流程（规模选择 → 主角小传 → 核心人物 → 批量生成）和 NPC 四级分类体系，修复聊天 403 CSRF 错误。

**Architecture:** 后端在现有 `generate.js` 路由文件中新增 3 个接口（protagonist / bulk-npcs / scenes），前端新增 `SetupPage` 向导页和 4 个组件。SSE 流式传输通过新建 `sse-client.js` 统一处理 CSRF token 注入。

**Tech Stack:** Node.js/Express, React 18, Vite, Tailwind CSS, zustand, Jest

**Spec:** `docs/superpowers/specs/2026-03-23-onboarding-npc-system-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `frontend/src/api/sse-client.js` | SSE fetch with CSRF token injection |
| `frontend/src/api/generate.js` | Frontend API client for protagonist / bulk-npcs / scenes |
| `frontend/src/components/wizard/ScaleSelector.jsx` | 世界规模选择卡片 |
| `frontend/src/components/setup/ProtagonistBioStep.jsx` | 步骤③ 主角小传 |
| `frontend/src/components/setup/CoreNpcStep.jsx` | 步骤④ 核心人物创建 |
| `frontend/src/components/setup/BulkGenerateStep.jsx` | 步骤⑤ 批量生成进度 |
| `frontend/src/pages/SetupPage.jsx` | 引导向导页面 |

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/api/chat.js` | Add CSRF token to streamChat |
| `frontend/src/api/worlds.js` | generateDraft 加 scale 参数 |
| `frontend/src/api/characters.js` | generateDraft 加 tier / relationship 参数 |
| `frontend/src/pages/CreateWorldPage.jsx` | 加 ScaleSelector + scale state + onboarding_complete |
| `frontend/src/pages/WorldPage.jsx` | 加 onboarding_complete === false 跳转 |
| `frontend/src/App.jsx` | 注册 /world/:worldId/setup 路由 |
| `src/endpoints/world-simulation/generate.js` | 新增 protagonist / bulk-npcs / scenes 路由，扩展 character 路由 |
| `tests/world-simulation/generate.test.js` | 新增对应测试 |

---

## Task 1: 修复 403 — 创建 sse-client.js 并修复 chat CSRF

**Files:**
- Create: `frontend/src/api/sse-client.js`
- Modify: `frontend/src/api/chat.js`

- [ ] **Step 1: Create sse-client.js**

```javascript
// frontend/src/api/sse-client.js
async function getCsrfToken() {
  try {
    const res = await fetch('/csrf-token');
    const data = await res.json();
    return data.token === 'disabled' ? null : data.token;
  } catch {
    return null;
  }
}

export async function fetchSSE(url, body, onChunk) {
  const token = await getCsrfToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-csrf-token'] = token;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try { onChunk(JSON.parse(data)); } catch { /* skip malformed */ }
      }
    }
    if (buffer.trim().startsWith('data: ')) {
      try { onChunk(JSON.parse(buffer.trim().slice(6))); } catch { /* skip */ }
    }
  } finally {
    reader.cancel();
  }
}
```

- [ ] **Step 2: Fix chat.js — add CSRF token to streamChat**

In `frontend/src/api/chat.js`, add CSRF token fetch before the raw `fetch` call. Change lines 10-16 to:

```javascript
export async function streamChat({ worldId, systemPrompt, messages, apiConfig, onDelta, onDone }) {
    // Fetch CSRF token (same logic as client.js getCsrfToken)
    let csrfToken = null;
    try {
        const csrfRes = await fetch('/csrf-token');
        const csrfData = await csrfRes.json();
        csrfToken = csrfData.token === 'disabled' ? null : csrfData.token;
    } catch { /* ignore */ }

    const headers = { 'Content-Type': 'application/json' };
    if (csrfToken) headers['x-csrf-token'] = csrfToken;

    const res = await fetch(`/api/world-sim/chat/${worldId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ systemPrompt, messages, apiConfig }),
    });
```

- [ ] **Step 3: Verify chat 403 is fixed**

Restart backend (`npm start`), open http://localhost:5173, enter a world, send a message. Should no longer get 403.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/sse-client.js frontend/src/api/chat.js
git commit -m "fix(chat): add CSRF token to SSE calls, create sse-client.js"
```

---

## Task 2: 后端 — 扩展 generate/character 支持 tier + relationship

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js`
- Modify: `tests/world-simulation/generate.test.js`

- [ ] **Step 1: Write test for character generation with tier/relationship**

Append to `tests/world-simulation/generate.test.js`:

```javascript
describe('POST /generate/character with tier and relationship', () => {
    test('passes tier and relationship to system prompt', async () => {
        let capturedSystem;
        setLLMAdapter(async (msgs, system) => {
            capturedSystem = system;
            return JSON.stringify(CHAR_DRAFT);
        });
        const res = await fetch(`${server.url}/character`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: 'A powerful wizard',
                worldContext: { power_system: { tiers: [] } },
                tier: 'legendary',
                relationship: '主角的导师',
            }),
        });
        expect(res.status).toBe(200);
        expect(capturedSystem).toContain('legendary');
        expect(capturedSystem).toContain('主角的导师');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:ws -- --testPathPattern=generate
```
Expected: FAIL — capturedSystem does not contain 'legendary'

- [ ] **Step 3: Update character route in generate.js**

In `src/endpoints/world-simulation/generate.js`, modify the `POST /character` handler:

```javascript
// POST /character
router.post('/character', async (req, res) => {
    const { description, worldContext, tier, relationship } = req.body;
    if (!description) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = worldContext ? `\nWorld power system: ${JSON.stringify(worldContext.power_system)}` : '';
    const tierHint = tier ? `\nCharacter tier: ${tier}. Adjust detail level accordingly (legendary=very detailed, elite=standard, normal=brief, disposable=minimal).` : '';
    const relHint = relationship ? `\nRelationship to protagonist: ${relationship}` : '';
    const system = CHAR_GEN_SYSTEM + tierHint + relHint;
    await generate(req, res, system, `Create a character based on this description: ${description}${worldInfo}`);
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:ws -- --testPathPattern=generate
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/generate.js tests/world-simulation/generate.test.js
git commit -m "feat(generate): extend character endpoint with tier and relationship params"
```

---

## Task 3: 后端 — 新增 generate/protagonist 接口

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js`
- Modify: `tests/world-simulation/generate.test.js`

- [ ] **Step 1: Write test**

Append to `tests/world-simulation/generate.test.js`:

```javascript
describe('POST /generate/protagonist', () => {
    test('extracts core NPCs from protagonist bio', async () => {
        const mockResponse = {
            core_npcs: [
                { name: 'Mentor', relationship: 'teacher', suggested_tier: 'legendary' },
                { name: 'Rival', relationship: 'enemy', suggested_tier: 'elite' },
            ],
        };
        setLLMAdapter(async () => JSON.stringify(mockResponse));
        const res = await fetch(`${server.url}/protagonist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                protagonistBio: 'I was trained by a great mentor, but my rival always challenged me.',
                worldContext: WORLD_DRAFT,
            }),
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.core_npcs).toHaveLength(2);
        expect(json.core_npcs[0].name).toBe('Mentor');
    });

    test('returns 400 without bio', async () => {
        const res = await fetch(`${server.url}/protagonist`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        expect(res.status).toBe(400);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:ws -- --testPathPattern=generate
```

- [ ] **Step 3: Add protagonist route to generate.js**

Add to `src/endpoints/world-simulation/generate.js` (before the character routes):

```javascript
const PROTAGONIST_SYSTEM = `You are a world-building assistant. Analyze the protagonist's biography and extract important NPCs mentioned or implied.
Return a JSON object: {"core_npcs":[{"name":"","relationship":"","suggested_tier":"legendary|elite"}]}
Only include characters who are significant to the protagonist's story.
IMPORTANT: Respond in the same language as the user's input. Respond only with valid JSON.`;

// POST /protagonist
router.post('/protagonist', async (req, res) => {
    const { protagonistBio, worldContext, apiConfig = {} } = req.body;
    if (!protagonistBio) return res.status(400).json({ error: 'missing_fields' });
    const worldInfo = worldContext ? `\nWorld context: ${JSON.stringify(worldContext.foundation)}` : '';
    let raw;
    try { raw = await callLLM([{ role: 'user', content: `Protagonist biography:\n${protagonistBio}${worldInfo}` }], PROTAGONIST_SYSTEM, apiConfig); }
    catch { return res.status(502).json({ error: 'llm_unavailable' }); }

    let result;
    try {
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        result = JSON.parse(cleaned);
    }
    catch { return res.status(422).json({ error: 'parse_failed', raw }); }

    return res.json(result);
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:ws -- --testPathPattern=generate
```

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/world-simulation/generate.js tests/world-simulation/generate.test.js
git commit -m "feat(generate): add protagonist analysis endpoint"
```

---

## Task 4: 后端 — 新增 bulk-npcs + scenes SSE 接口

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js`
- Modify: `tests/world-simulation/generate.test.js`

- [ ] **Step 1: Write test for bulk-npcs**

Append to `tests/world-simulation/generate.test.js`:

```javascript
describe('POST /generate/bulk-npcs', () => {
    test('streams NPC generation progress via SSE', async () => {
        let callCount = 0;
        setLLMAdapter(async () => {
            callCount++;
            return JSON.stringify({
                name: `NPC-${callCount}`,
                identity: { description: 'A character' },
                power_tier: 1,
                current_state: { relationship_to_player: 'neutral', status: 'idle' },
                voice: { style: 'calm', example_lines: [] },
            });
        });

        const res = await fetch(`${server.url}/bulk-npcs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                worldId: 'test-world-bulk',
                worldContext: WORLD_DRAFT,
                scale: 'small',
            }),
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.startsWith('data: '));
        const events = lines.map(l => JSON.parse(l.slice(6)));
        const doneEvent = events.find(e => e.type === 'done');
        expect(doneEvent).toBeDefined();
        expect(doneEvent.summary).toBeDefined();
    });
});
```

- [ ] **Step 2: Write test for scenes**

```javascript
describe('POST /generate/scenes', () => {
    test('streams scene generation progress via SSE', async () => {
        let callCount = 0;
        setLLMAdapter(async () => {
            callCount++;
            return JSON.stringify({
                name: `Scene-${callCount}`,
                description: 'A place',
                is_locked: false,
            });
        });

        const res = await fetch(`${server.url}/scenes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                worldId: 'test-world-scenes',
                worldContext: WORLD_DRAFT,
                scale: 'small',
            }),
        });
        expect(res.status).toBe(200);
        const text = await res.text();
        const lines = text.split('\n').filter(l => l.startsWith('data: '));
        const events = lines.map(l => JSON.parse(l.slice(6)));
        const doneEvent = events.find(e => e.type === 'done');
        expect(doneEvent).toBeDefined();
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm run test:ws -- --testPathPattern=generate
```

- [ ] **Step 4: Add scale constants and helper to generate.js**

Add to `src/endpoints/world-simulation/generate.js`:

```javascript
const SCALE_COUNTS = {
    small:  { legendary: 2, elite: 3, normal: 5, disposable: 5, scenes: 6 },
    medium: { legendary: 3, elite: 7, normal: 12, disposable: 8, scenes: 15 },
    large:  { legendary: 5, elite: 15, normal: 30, disposable: 15, scenes: 35 },
};

const NPC_TIER_PROMPTS = {
    legendary: `Generate a LEGENDARY tier NPC with rich detail (~200 chars description, personality, background, 3 example voice lines). Return JSON: {"name":"","identity":{"description":"","personality":"","background":""},"power_tier":0,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]}}`,
    elite: `Generate an ELITE tier NPC with standard detail (~80 chars description, personality, 1 voice line). Return JSON: {"name":"","identity":{"description":"","personality":""},"power_tier":0,"current_state":{"relationship_to_player":"neutral","status":""},"voice":{"style":"","example_lines":[]}}`,
    normal: `Generate a NORMAL tier NPC with brief detail (~30 chars). Return JSON: {"name":"","identity":{"description":""},"current_state":{"relationship_to_player":"neutral"}}`,
    disposable: `Generate a DISPOSABLE tier NPC template (role title, generic description). Return JSON: {"name":"","identity":{"description":""}}`,
};

const SCENE_PROMPT = `Generate a scene/location for this world. Return JSON: {"name":"","description":"","is_locked":false}`;

function sseWrite(res, data) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}
```

- [ ] **Step 5: Add bulk-npcs route**

```javascript
// POST /bulk-npcs (SSE)
router.post('/bulk-npcs', async (req, res) => {
    const { worldId, worldContext, scale = 'small', apiConfig = {} } = req.body;
    if (!worldId || !worldContext) return res.status(400).json({ error: 'missing_fields' });

    const counts = SCALE_COUNTS[scale] || SCALE_COUNTS.small;
    const tiers = ['legendary', 'elite', 'normal', 'disposable'];
    const tasks = tiers.flatMap(tier =>
        Array.from({ length: counts[tier] }, () => tier)
    );
    const total = tasks.length;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.setTimeout(0);

    const summary = { legendary: 0, elite: 0, normal: 0, disposable: 0 };
    let done = 0;

    for (const tier of tasks) {
        const system = NPC_TIER_PROMPTS[tier] + `\nWorld: ${worldContext.foundation?.background || ''}\nIMPORTANT: Respond in the same language as the world description. Respond only with valid JSON.`;
        try {
            const raw = await callLLM([{ role: 'user', content: `Generate one ${tier} NPC for this world.` }], system, apiConfig);
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            const npc = JSON.parse(cleaned);
            npc.id = crypto.randomUUID();
            npc.world_id = worldId;
            npc.tier = tier;
            npc.is_core = false;
            npc.is_template = tier === 'disposable';

            if (req.user?.directories) {
                const { writeCharacter } = await import('./storage/characters.js');
                await writeCharacter(req.user.directories, npc.id, npc);
            }

            done++;
            summary[tier]++;
            sseWrite(res, { type: 'progress', done, total, item: npc });
        } catch (err) {
            done++;
            sseWrite(res, { type: 'error', index: done, message: err.message || 'generation failed' });
        }
    }

    sseWrite(res, { type: 'done', summary });
    res.end();
});
```

- [ ] **Step 6: Add scenes route**

```javascript
// POST /scenes (SSE)
router.post('/scenes', async (req, res) => {
    const { worldId, worldContext, scale = 'small', apiConfig = {} } = req.body;
    if (!worldId || !worldContext) return res.status(400).json({ error: 'missing_fields' });

    const total = (SCALE_COUNTS[scale] || SCALE_COUNTS.small).scenes;

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.setTimeout(0);

    const generatedScenes = [];
    let done = 0;

    for (let i = 0; i < total; i++) {
        const system = SCENE_PROMPT + `\nWorld: ${worldContext.foundation?.background || ''}\nGeography: ${worldContext.foundation?.geography || ''}\nIMPORTANT: Respond in the same language as the world description. Respond only with valid JSON.`;
        try {
            const raw = await callLLM([{ role: 'user', content: `Generate scene ${i + 1} of ${total}. Make it distinct from previous scenes.` }], system, apiConfig);
            const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            const scene = JSON.parse(cleaned);
            scene.id = crypto.randomUUID();
            generatedScenes.push(scene);

            done++;
            sseWrite(res, { type: 'progress', done, total, item: scene });
        } catch (err) {
            done++;
            sseWrite(res, { type: 'error', index: done, message: err.message || 'generation failed' });
        }
    }

    if (req.user?.directories && generatedScenes.length > 0) {
        const { readScenes, writeScenes } = await import('./storage/scenes.js');
        const existing = await readScenes(req.user.directories, worldId);
        existing.scenes = [...(existing.scenes || []), ...generatedScenes];
        await writeScenes(req.user.directories, worldId, existing);
    }

    sseWrite(res, { type: 'done', summary: { scenes: generatedScenes.length } });
    res.end();
});
```

- [ ] **Step 7: Add crypto import at top of generate.js**

Add after existing imports:
```javascript
import crypto from 'node:crypto';
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npm run test:ws -- --testPathPattern=generate
```

- [ ] **Step 9: Commit**

```bash
git add src/endpoints/world-simulation/generate.js tests/world-simulation/generate.test.js
git commit -m "feat(generate): add bulk-npcs and scenes SSE endpoints"
```

---

## Task 5: 前端 — ScaleSelector + CreateWorldPage 改造

**Files:**
- Create: `frontend/src/components/wizard/ScaleSelector.jsx`
- Modify: `frontend/src/pages/CreateWorldPage.jsx`
- Modify: `frontend/src/api/worlds.js`

- [ ] **Step 1: Create ScaleSelector component**

```jsx
// frontend/src/components/wizard/ScaleSelector.jsx
const SCALES = [
  {
    key: 'small',
    label: '小世界',
    desc: '15 个 NPC · 6 个场景',
    tokens: '~3,000 tokens',
  },
  {
    key: 'medium',
    label: '中世界',
    desc: '30 个 NPC · 15 个场景',
    tokens: '~10,000 tokens',
  },
  {
    key: 'large',
    label: '大世界',
    desc: '65 个 NPC · 35 个场景',
    tokens: '~25,000 tokens',
  },
];

export default function ScaleSelector({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {SCALES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onChange(s.key)}
          className={`text-left p-4 rounded-lg border transition-colors ${
            value === s.key
              ? 'border-ink/40 bg-white/80'
              : 'border-ink/10 hover:border-ink/20'
          }`}
        >
          <p className="text-sm font-semibold text-ink">{s.label}</p>
          <p className="text-xs text-ink/50 mt-1">{s.desc}</p>
          <p className="text-xs text-ink/30 mt-2">{s.tokens}</p>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update worlds.js — add scale to generateDraft**

In `frontend/src/api/worlds.js`, update `generateDraft`:

```javascript
generateDraft: (description, apiConfig, scale) =>
    apiFetch(`${BASE}/generate/world`, { method: 'POST', body: JSON.stringify({ description, apiConfig, scale }) }),
```

- [ ] **Step 3: Update CreateWorldPage.jsx**

Add `useState` for `scale`, add `ScaleSelector` above the description textarea, pass `scale` to `generateDraft` and into `worldToSave` with `onboarding_complete: false`:

Import:
```javascript
import ScaleSelector from '../components/wizard/ScaleSelector.jsx';
```

Add state (inside component, before useDraftWizard):
```javascript
const [scale, setScale] = useState('medium');
```

Update generateFn to pass scale:
```javascript
generateFn: (desc, apiConfig) => worldsApi.generateDraft(desc, apiConfig, scale),
```

Update saveFn to include scale and onboarding_complete:
```javascript
saveFn: async (cleanDraft, description) => {
    const worldToSave = {
        ...cleanDraft,
        id: cleanDraft.id || crypto.randomUUID(),
        name: description,
        scale,
        onboarding_complete: false,
        created_at: new Date().toISOString(),
    };
    await worldsApi.create(worldToSave);
    return `/world/${worldToSave.id}/setup`;
},
```

Note: redirect now goes to `/setup` instead of the world page.

Add `ScaleSelector` in JSX above the description textarea:
```jsx
<label className="block mb-5">
    <span className="text-xs text-ink/40 uppercase tracking-wider block mb-2">世界规模</span>
    <ScaleSelector value={scale} onChange={setScale} />
</label>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/wizard/ScaleSelector.jsx frontend/src/pages/CreateWorldPage.jsx frontend/src/api/worlds.js
git commit -m "feat(frontend): add scale selector to CreateWorldPage"
```

---

## Task 6: 前端 — API client + SetupPage + 路由

**Files:**
- Create: `frontend/src/api/generate.js`
- Create: `frontend/src/pages/SetupPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create frontend API client for generate endpoints**

```javascript
// frontend/src/api/generate.js
import { apiFetch } from './client.js';
import { fetchSSE } from './sse-client.js';

const BASE = '/api/world-sim/generate';

export const generateApi = {
  protagonist: (protagonistBio, worldContext, apiConfig) =>
    apiFetch(`${BASE}/protagonist`, {
      method: 'POST',
      body: JSON.stringify({ protagonistBio, worldContext, apiConfig }),
    }),

  bulkNpcs: (worldId, worldContext, scale, apiConfig, onChunk) =>
    fetchSSE(`${BASE}/bulk-npcs`, { worldId, worldContext, scale, apiConfig }, onChunk),

  scenes: (worldId, worldContext, scale, apiConfig, onChunk) =>
    fetchSSE(`${BASE}/scenes`, { worldId, worldContext, scale, apiConfig }, onChunk),
};
```

- [ ] **Step 2: Create SetupPage skeleton**

```jsx
// frontend/src/pages/SetupPage.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { worldsApi } from '../api/worlds.js';
import { useSettingsStore } from '../stores/settingsStore.js';
import ProtagonistBioStep from '../components/setup/ProtagonistBioStep.jsx';
import CoreNpcStep from '../components/setup/CoreNpcStep.jsx';
import BulkGenerateStep from '../components/setup/BulkGenerateStep.jsx';
import Spinner from '../components/ui/Spinner.jsx';

const STEP_LABELS = ['主角小传', '核心人物', '生成世界内容'];

export default function SetupPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const { getApiConfig } = useSettingsStore();

  const [world, setWorld] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0=bio, 1=core npcs, 2=bulk generate
  const [protagonistBio, setProtagonistBio] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [coreNpcSuggestions, setCoreNpcSuggestions] = useState([]);
  const [createdCoreNpcs, setCreatedCoreNpcs] = useState([]);

  useEffect(() => {
    worldsApi.get(worldId)
      .then(setWorld)
      .finally(() => setLoading(false));
  }, [worldId]);

  async function handleFinish() {
    try {
      await worldsApi.update(worldId, { ...world, onboarding_complete: true });
    } catch { /* non-blocking */ }
    navigate(`/world/${worldId}`, { replace: true });
  }

  if (loading) return <div className="min-h-screen bg-parchment flex items-center justify-center"><Spinner /></div>;
  if (!world) return <div className="min-h-screen bg-parchment p-10"><p className="text-ink/50">世界未找到</p></div>;

  return (
    <div className="min-h-screen bg-parchment">
      <header className="border-b border-ink/8 px-10 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-base font-semibold text-ink">{world.name} — 初始设定</h1>
          <div className="flex gap-2">
            {STEP_LABELS.map((label, i) => (
              <span
                key={i}
                className={`text-xs px-2 py-1 rounded ${
                  i === step ? 'bg-ink/10 text-ink' : i < step ? 'text-ink/40' : 'text-ink/20'
                }`}
              >
                {i + 1}. {label}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-10 py-10">
        {step === 0 && (
          <ProtagonistBioStep
            bio={protagonistBio}
            onBioChange={setProtagonistBio}
            playerName={playerName}
            onPlayerNameChange={setPlayerName}
            worldContext={world}
            apiConfig={getApiConfig()}
            onComplete={(suggestions) => {
              setCoreNpcSuggestions(suggestions);
              setStep(1);
            }}
          />
        )}
        {step === 1 && (
          <CoreNpcStep
            suggestions={coreNpcSuggestions}
            worldId={worldId}
            worldContext={world}
            playerName={playerName}
            protagonistBio={protagonistBio}
            apiConfig={getApiConfig()}
            onComplete={(npcs) => {
              setCreatedCoreNpcs(npcs);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <BulkGenerateStep
            worldId={worldId}
            worldContext={world}
            scale={world.scale || 'small'}
            apiConfig={getApiConfig()}
            onComplete={handleFinish}
          />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder components**

Create three empty placeholder components so the page compiles:

```jsx
// frontend/src/components/setup/ProtagonistBioStep.jsx
export default function ProtagonistBioStep({ bio, onBioChange, playerName, onPlayerNameChange, worldContext, apiConfig, onComplete }) {
  return <p>ProtagonistBioStep placeholder</p>;
}
```

```jsx
// frontend/src/components/setup/CoreNpcStep.jsx
export default function CoreNpcStep({ suggestions, worldId, worldContext, playerName, protagonistBio, apiConfig, onComplete }) {
  return <p>CoreNpcStep placeholder</p>;
}
```

```jsx
// frontend/src/components/setup/BulkGenerateStep.jsx
export default function BulkGenerateStep({ worldId, worldContext, scale, apiConfig, onComplete }) {
  return <p>BulkGenerateStep placeholder</p>;
}
```

- [ ] **Step 4: Register route in App.jsx**

Add import and route **before** the `/world/:worldId` route:

```jsx
import SetupPage from './pages/SetupPage.jsx';
// ...
<Route path="/world/:worldId/setup" element={<SetupPage />} />
<Route path="/world/:worldId" element={<WorldPage />} />
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/generate.js frontend/src/pages/SetupPage.jsx frontend/src/components/setup/ frontend/src/App.jsx
git commit -m "feat(frontend): add SetupPage skeleton with route and generate API client"
```

---

## Task 7: 前端 — ProtagonistBioStep（步骤③）

**Files:**
- Modify: `frontend/src/components/setup/ProtagonistBioStep.jsx`

- [ ] **Step 1: Implement ProtagonistBioStep**

```jsx
// frontend/src/components/setup/ProtagonistBioStep.jsx
import { useState } from 'react';
import { generateApi } from '../../api/generate.js';
import { playerApi } from '../../api/player.js';
import Button from '../ui/Button.jsx';

export default function ProtagonistBioStep({
  bio, onBioChange, playerName, onPlayerNameChange,
  worldContext, apiConfig, onComplete, worldId,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit() {
    if (!bio.trim() || !playerName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await generateApi.protagonist(bio, worldContext, apiConfig);
      const suggestions = result.core_npcs || [];
      onComplete(suggestions);
    } catch (err) {
      setError('分析小传失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink/50 mb-6 leading-relaxed">
        写下你的主角小传，AI 会从中提取需要创建的核心人物。
      </p>

      <label className="block mb-5">
        <span className="text-xs text-ink/40 uppercase tracking-wider block mb-2">主角名称</span>
        <input
          type="text"
          className="w-full bg-white/60 border border-ink/12 rounded-lg focus:border-ink/30 focus:outline-none text-sm p-3"
          placeholder="你的角色叫什么名字？"
          value={playerName}
          onChange={(e) => onPlayerNameChange(e.target.value)}
        />
      </label>

      <label className="block mb-5">
        <span className="text-xs text-ink/40 uppercase tracking-wider block mb-2">主角小传</span>
        <textarea
          className="w-full bg-white/60 border border-ink/12 rounded-lg focus:border-ink/30 focus:outline-none text-sm p-4 resize-none leading-relaxed"
          rows={10}
          placeholder="描述你的角色背景、经历、重要的人物关系……AI 会从中提取需要创建的核心人物。"
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
        />
      </label>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <Button onClick={handleSubmit} disabled={loading || !bio.trim() || !playerName.trim()}>
        {loading ? '分析中…' : '提取核心人物'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Update SetupPage to pass worldId to ProtagonistBioStep**

In `SetupPage.jsx`, add `worldId={worldId}` to `<ProtagonistBioStep>`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/setup/ProtagonistBioStep.jsx frontend/src/pages/SetupPage.jsx
git commit -m "feat(frontend): implement ProtagonistBioStep (step 3)"
```

---

## Task 8: 前端 — CoreNpcStep（步骤④）

**Files:**
- Modify: `frontend/src/components/setup/CoreNpcStep.jsx`

- [ ] **Step 1: Implement CoreNpcStep**

```jsx
// frontend/src/components/setup/CoreNpcStep.jsx
import { useState, useCallback } from 'react';
import { charactersApi } from '../../api/characters.js';
import { playerApi } from '../../api/player.js';
import Button from '../ui/Button.jsx';
import DraftBlock from '../wizard/DraftBlock.jsx';

const SECTION_LABELS = {
  identity: '身份',
  voice: '声线',
  current_state: '状态',
};

export default function CoreNpcStep({
  suggestions, worldId, worldContext, playerName, protagonistBio, apiConfig, onComplete,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createdNpcs, setCreatedNpcs] = useState([]);
  const [error, setError] = useState(null);

  const current = suggestions[currentIndex];
  const isLast = currentIndex >= suggestions.length - 1;

  async function handleGenerate() {
    if (!current) return;
    setGenerating(true);
    setError(null);
    try {
      const { draft: d } = await charactersApi.generateDraft(
        worldId,
        `Name: ${current.name}, Relationship to protagonist: ${current.relationship}`,
        apiConfig,
        current.suggested_tier,
        current.relationship,
      );
      setDraft(d);
    } catch {
      setError('生成失败，请重试');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const char = {
        ...draft,
        id: crypto.randomUUID(),
        world_id: worldId,
        tier: current.suggested_tier || 'legendary',
        is_core: true,
        is_template: false,
      };
      await charactersApi.create(char);
      setCreatedNpcs((prev) => [...prev, char]);
      advance();
    } catch {
      setError('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    advance();
  }

  async function advance() {
    setDraft(null);
    setError(null);
    if (isLast) {
      // Create player
      try {
        await playerApi.create(worldId, {
          id: crypto.randomUUID(),
          world_id: worldId,
          name: playerName,
          status: { health: 100, mental: 100, reputation: 0, current_location: null },
          inventory: [],
        });
      } catch { /* player may already exist */ }
      onComplete(createdNpcs);
    } else {
      setCurrentIndex((i) => i + 1);
    }
  }

  if (suggestions.length === 0) {
    return (
      <div className="max-w-2xl">
        <p className="text-sm text-ink/50 mb-6">AI 未从小传中识别出核心人物，直接进入下一步。</p>
        <Button onClick={() => {
          playerApi.create(worldId, {
            id: crypto.randomUUID(), world_id: worldId, name: playerName,
            status: { health: 100, mental: 100, reputation: 0, current_location: null },
            inventory: [],
          }).catch(() => {});
          onComplete([]);
        }}>继续</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <p className="text-xs text-ink/40 mb-4">
        核心人物 {currentIndex + 1} / {suggestions.length}：{current.name}（{current.relationship}）
      </p>

      {!draft ? (
        <div>
          <div className="border border-ink/10 rounded-lg p-5 mb-5">
            <p className="text-sm text-ink"><strong>{current.name}</strong> — {current.relationship}</p>
            <p className="text-xs text-ink/40 mt-1">建议等级：{current.suggested_tier}</p>
          </div>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? '生成中…' : 'AI 生成草稿'}
            </Button>
            <Button variant="ghost" onClick={handleSkip}>跳过此人物</Button>
          </div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              draft[key] ? (
                <DraftBlock key={key} title={label} content={draft[key]} sectionKey={key} onRefine={() => {}} />
              ) : null
            ))}
          </div>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '确认保存'}
            </Button>
            <Button variant="ghost" onClick={handleSkip}>跳过</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update characters.js API to support tier/relationship**

In `frontend/src/api/characters.js`, update `generateDraft`:

```javascript
generateDraft: (worldId, description, apiConfig, tier, relationship) =>
    apiFetch(`${BASE}/generate/character`, {
      method: 'POST',
      body: JSON.stringify({ description, worldContext: null, apiConfig, tier, relationship }),
    }),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/setup/CoreNpcStep.jsx frontend/src/api/characters.js
git commit -m "feat(frontend): implement CoreNpcStep (step 4)"
```

---

## Task 9: 前端 — BulkGenerateStep（步骤⑤）

**Files:**
- Modify: `frontend/src/components/setup/BulkGenerateStep.jsx`

- [ ] **Step 1: Implement BulkGenerateStep**

```jsx
// frontend/src/components/setup/BulkGenerateStep.jsx
import { useState, useEffect, useRef } from 'react';
import { generateApi } from '../../api/generate.js';
import Button from '../ui/Button.jsx';

export default function BulkGenerateStep({ worldId, worldContext, scale, apiConfig, onComplete }) {
  const [phase, setPhase] = useState('idle'); // idle | npcs | scenes | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState([]);
  const [summary, setSummary] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    runGeneration();
  }, []);

  async function runGeneration() {
    // Phase 1: NPCs
    setPhase('npcs');
    let npcSummary = {};
    try {
      await generateApi.bulkNpcs(worldId, worldContext, scale, apiConfig, (event) => {
        if (event.type === 'progress') setProgress({ done: event.done, total: event.total });
        if (event.type === 'error') setErrors((prev) => [...prev, event.message]);
        if (event.type === 'done') npcSummary = event.summary || {};
      });
    } catch (err) {
      setErrors((prev) => [...prev, `NPC 生成失败: ${err.message}`]);
    }

    // Phase 2: Scenes
    setPhase('scenes');
    setProgress({ done: 0, total: 0 });
    let sceneSummary = {};
    try {
      await generateApi.scenes(worldId, worldContext, scale, apiConfig, (event) => {
        if (event.type === 'progress') setProgress({ done: event.done, total: event.total });
        if (event.type === 'error') setErrors((prev) => [...prev, event.message]);
        if (event.type === 'done') sceneSummary = event.summary || {};
      });
    } catch (err) {
      setErrors((prev) => [...prev, `场景生成失败: ${err.message}`]);
    }

    setPhase('done');
    setSummary({ ...npcSummary, ...sceneSummary });
  }

  const phaseLabel = phase === 'npcs' ? '正在生成 NPC…' : phase === 'scenes' ? '正在生成场景…' : '生成完成';
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-ink/50 mb-6">{phaseLabel}</p>

      {phase !== 'done' && (
        <div className="mb-6">
          <div className="h-2 bg-ink/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-ink/30 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-ink/40 mt-2">{progress.done} / {progress.total}</p>
        </div>
      )}

      {phase === 'done' && summary && (
        <div className="border border-ink/10 rounded-lg p-5 mb-6">
          <p className="text-xs text-ink/40 uppercase tracking-wider mb-3">生成汇总</p>
          <div className="grid grid-cols-2 gap-2 text-sm text-ink/70">
            {summary.legendary > 0 && <p>传奇 NPC: {summary.legendary}</p>}
            {summary.elite > 0 && <p>精英 NPC: {summary.elite}</p>}
            {summary.normal > 0 && <p>普通 NPC: {summary.normal}</p>}
            {summary.disposable > 0 && <p>无用 NPC: {summary.disposable}</p>}
            {summary.scenes > 0 && <p>场景: {summary.scenes}</p>}
          </div>
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 text-xs text-red-500">
          {errors.slice(-3).map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {phase === 'done' && (
        <Button onClick={onComplete}>进入世界</Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/setup/BulkGenerateStep.jsx
git commit -m "feat(frontend): implement BulkGenerateStep (step 5)"
```

---

## Task 10: 前端 — WorldPage 引导跳转

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx`

- [ ] **Step 1: Add useNavigate import and onboarding redirect**

At top of `WorldPage.jsx`, add `useNavigate` to the router import:
```javascript
import { useParams, Link, useNavigate } from 'react-router-dom';
```

Add inside the component, after state declarations:
```javascript
const navigate = useNavigate();
```

Add a `useEffect` after the data-loading useEffect (the one with `Promise.all`):
```javascript
useEffect(() => {
    if (world && world.onboarding_complete === false) {
        navigate(`/world/${worldId}/setup`, { replace: true });
    }
}, [world]);
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/WorldPage.jsx
git commit -m "feat(frontend): redirect to setup page when onboarding incomplete"
```

---

## Verification

After all tasks, restart backend and frontend:

1. `npm start` (backend on 8000)
2. `cd frontend && npm run dev` (frontend on 5173)
3. Open http://localhost:5173
4. Create a new world → should see scale selector
5. Generate + confirm → redirects to /setup
6. Write protagonist bio → extracts core NPCs
7. Create core NPCs → bulk generate starts
8. Bulk generate completes → enter world
9. Chat should work (no 403)
