# World UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 issues: chat error debugging, NPC scene distribution, conversation block system, archive tier accordion, exit/delete world.

**Architecture:** Incremental changes across frontend components and backend endpoints. Chat system gets a block-based store redesign. Scene generation maps NPC names→IDs for `characters_present`. No new dependencies.

**Tech Stack:** React, Zustand, Express, SSE streaming, Vite

---

### Task 1: Backend Chat Error Logging (Issue 3)

**Problem:** The SettingsPage API test calls LLM directly from browser, but chat goes through backend. Backend chat endpoint doesn't log errors to console, making debugging impossible.

**Note:** The ChatPane error display fix is handled in Task 5 (the new ChatPane already includes `console.error` and real error messages). This task only adds backend-side logging.

**Files:**
- Modify: `src/endpoints/world-simulation/chat.js:27-29`

- [ ] **Step 1: Add console.error to backend chat endpoint**

In `src/endpoints/world-simulation/chat.js`, replace the catch block (line 27-29):

```javascript
    } catch (err) {
        console.error('[chat] streamLLM failed:', err.message);
        res.write(`data: ${JSON.stringify({ error: err.message || 'LLM request failed' })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/endpoints/world-simulation/chat.js
git commit -m "fix: add error logging to chat endpoint for debugging"
```

---

### Task 2: Exit World + Delete World (Issue 5)

**Files:**
- Modify: `frontend/src/pages/WorldPage.jsx:141-147` (header section)

- [ ] **Step 1: Add back button and delete button to WorldPage header**

In `frontend/src/pages/WorldPage.jsx`, add `useNavigate` import if not already present (it is), and add `worldsApi` usage for delete. Replace the header section (lines 141-147):

```jsx
      <header className="flex items-center gap-4 px-6 py-2.5 border-b border-ink/8">
        <button
          onClick={() => navigate('/')}
          className="text-xs text-ink/40 hover:text-ink/70 transition-colors"
        >
          ← 返回
        </button>
        <h1 className="text-sm font-medium flex-1 truncate">{world?.name}</h1>
        <span className="text-xs text-ink/40">{NARRATIVE_MODE_LABELS[narrativeMode] || '群像'}模式</span>
        <Link to={`/world/${worldId}/archive`} className="text-xs text-ink/40 hover:text-ink/70 transition-colors">
          档案
        </Link>
        <button
          onClick={async () => {
            if (!window.confirm(`确认删除「${world?.name}」？此操作不可恢复。`)) return;
            try {
              await worldsApi.delete(worldId);
              navigate('/', { replace: true });
            } catch {
              alert('删除失败');
            }
          }}
          className="text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          删除世界
        </button>
      </header>
```

- [ ] **Step 2: Verify and commit**

Run: `cd frontend && npx vite build`

```bash
git add frontend/src/pages/WorldPage.jsx
git commit -m "feat: add back button and delete world option to world header"
```

---

### Task 3: Archive Character Accordion by Tier (Issue 4)

**Files:**
- Modify: `frontend/src/pages/WorldArchivePage.jsx:108-115` (characters tab)

- [ ] **Step 1: Add tier constants and accordion rendering**

At the top of `WorldArchivePage.jsx`, after existing constants (line 16), add:

```javascript
const TIER_ORDER = ['legendary', 'elite', 'normal', 'disposable'];
const TIER_LABELS = { legendary: '传奇', elite: '精英', normal: '普通', disposable: '龙套' };
```

- [ ] **Step 2: Replace flat character list with accordion**

Replace the characters tab section (lines 108-115) with:

```jsx
        {activeTab === 'characters' && (characters.length === 0 ? (
          <p className="text-xs text-ink/30">暂无角色</p>
        ) : (
          <div className="space-y-2">
            {TIER_ORDER.map((tier) => {
              const group = characters.filter((c) => (c.tier || 'normal') === tier);
              if (group.length === 0) return null;
              return (
                <details key={tier} className="border border-ink/8 rounded-lg" open={tier === 'legendary' || tier === 'elite'}>
                  <summary className="px-4 py-2.5 cursor-pointer select-none flex items-center justify-between">
                    <span className="text-sm font-medium text-ink/70">{TIER_LABELS[tier] || tier}</span>
                    <span className="text-xs text-ink/30">{group.length}</span>
                  </summary>
                  <div className="px-4 pb-3">
                    {group.map((c) => (
                      <div key={c.id} className="py-1.5 border-t border-ink/5 first:border-t-0">
                        <p className="text-sm text-ink">{c.name}</p>
                        {c.identity?.description && (
                          <p className="text-xs text-ink/40 mt-0.5 line-clamp-1">{c.identity.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        ))}
```

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npx vite build`

```bash
git add frontend/src/pages/WorldArchivePage.jsx
git commit -m "feat: archive character list grouped by tier with accordion"
```

---

### Task 4: NPC Scene Distribution (Issue 1)

**Problem:** All NPCs shown in sidebar regardless of scene. Scene generation puts character names (not IDs) in `characters_present`. Need to: (a) map names→IDs after generation, (b) filter sidebar by current scene.

**Files:**
- Modify: `src/endpoints/world-simulation/generate.js:163-205` (scenes endpoint)
- Modify: `frontend/src/components/setup/BulkGenerateStep.jsx:73-87` (pass NPC list to scene gen)
- Modify: `frontend/src/pages/WorldPage.jsx:31,109-112,158-164` (filter characters by scene)
- Modify: `frontend/src/components/world/CharacterSelector.jsx` (show tier badge)

- [ ] **Step 1: Backend — map character names to IDs after scene generation**

In `src/endpoints/world-simulation/generate.js`, inside the `/scenes` handler, insert name→ID resolution **between** `JSON.parse` (line 183) and `scene.id = crypto.randomUUID()` (line 184) — this ensures the mapped IDs are present both in the persisted data AND in the SSE `item` sent to the frontend:

```javascript
            const scene = JSON.parse(stripFences(raw));
            // Map character names to IDs (must be before push and SSE emit)
            if (scene.characters_present && characters.length > 0) {
                scene.characters_present = scene.characters_present.map(name => {
                    const match = characters.find(c => c.name === name);
                    return match ? match.id : name; // keep name as fallback
                });
            }
            scene.id = crypto.randomUUID();
```

- [ ] **Step 2: Frontend — filter CharacterSelector by current scene**

In `frontend/src/pages/WorldPage.jsx`, compute the visible characters based on `currentScene`:

Replace the CharacterSelector usage (around line 160-164) with filtered characters. Add this computed value before the return statement:

```javascript
  const sceneCharacterIds = currentScene?.characters_present || [];
  const visibleCharacters = sceneCharacterIds.length > 0
    ? characters.filter(c => sceneCharacterIds.includes(c.id))
    : characters.filter(c => c.tier === 'legendary' || c.tier === 'elite');
```

Then update CharacterSelector to use `visibleCharacters`:

```jsx
          <CharacterSelector
            characters={visibleCharacters}
            selectedId={selectedCharacterId}
            onSelect={setSelectedCharacterId}
          />
```

- [ ] **Step 3: Auto-clear selected character when changing scene**

**Note:** Task 5 will further update this function to also call `clearBlocks()`. This step adds `setSelectedCharacterId(null)` which is needed regardless.

In `WorldPage.jsx`, update `handleSceneEnter` to clear selected character:

```javascript
  function handleSceneEnter(result) {
    setCurrentScene(result.scene);
    setSelectedCharacterId(null);
    setPlayer((prev) => prev ? { ...prev, status: { ...prev.status, current_location: result.scene.id } } : prev);
  }
```

- [ ] **Step 4: Add tier badge to CharacterSelector**

In `frontend/src/components/world/CharacterSelector.jsx`, add a subtle tier indicator:

```jsx
const TIER_DOTS = { legendary: '★', elite: '◆', normal: '', disposable: '' };

export default function CharacterSelector({ characters, selectedId, onSelect }) {
  if (characters.length === 0) return (
    <div>
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-2">对话角色</p>
      <p className="text-xs text-ink/20">当前场景无角色</p>
    </div>
  );

  return (
    <div>
      <p className="text-[10px] text-ink/30 uppercase tracking-wider mb-2">对话角色</p>
      <div className="flex flex-col gap-1">
        {characters.map((c) => {
          const isSelected = selectedId === c.id;
          const dot = TIER_DOTS[c.tier] || '';
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : c.id)}
              className={`text-left text-xs px-2.5 py-1.5 rounded transition-colors truncate ${
                isSelected
                  ? 'bg-ink/10 text-ink font-medium'
                  : 'text-ink/40 hover:text-ink/60 hover:bg-ink/5'
              }`}
            >
              {dot && <span className="mr-1 text-[10px]">{dot}</span>}{c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `cd frontend && npx vite build`

```bash
git add src/endpoints/world-simulation/generate.js frontend/src/pages/WorldPage.jsx frontend/src/components/world/CharacterSelector.jsx
git commit -m "feat: distribute NPCs across scenes, filter sidebar by current scene"
```

---

### Task 5: Chat Block System (Issue 2)

**Problem:** Chat is a flat message array. Need: visual blocks per character, transition indicators, export, scene-change clears chat.

**Files:**
- Modify: `frontend/src/stores/chatStore.js` (redesign store with blocks)
- Create: `frontend/src/components/chat/ChatBlock.jsx` (block container UI)
- Create: `frontend/src/components/chat/ChatExportMenu.jsx` (export dropdown)
- Modify: `frontend/src/components/chat/ChatPane.jsx` (use block-based rendering + export)
- Modify: `frontend/src/pages/WorldPage.jsx` (clear chat on scene change, pass character info)

#### Sub-step 5a: Redesign chatStore with blocks

- [ ] **Step 1: Update chatStore with block structure**

Replace `frontend/src/stores/chatStore.js`:

```javascript
import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  blocks: [],       // [{ id, characterId, characterName, messages: [{ role, content, error? }] }]
  streaming: false,

  // Get or create a block for the active character
  ensureBlock(characterId, characterName) {
    const { blocks } = get();
    const last = blocks[blocks.length - 1];
    if (last && last.characterId === characterId) return last.id;
    const id = crypto.randomUUID();
    set({ blocks: [...blocks, { id, characterId, characterName, messages: [] }] });
    return id;
  },

  addMessage(blockId, msg) {
    set((s) => ({
      blocks: s.blocks.map(b =>
        b.id === blockId ? { ...b, messages: [...b.messages, msg] } : b
      ),
    }));
  },

  updateLastMessage(blockId, content) {
    set((s) => ({
      blocks: s.blocks.map(b => {
        if (b.id !== blockId) return b;
        const msgs = [...b.messages];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
        return { ...b, messages: msgs };
      }),
    }));
  },

  // Flat messages for context building (all blocks merged)
  getAllMessages() {
    return get().blocks.flatMap(b => b.messages);
  },

  // Messages for a specific character
  getCharacterMessages(characterId) {
    return get().blocks
      .filter(b => b.characterId === characterId)
      .flatMap(b => b.messages);
  },

  setStreaming: (streaming) => set({ streaming }),
  clearBlocks: () => set({ blocks: [], streaming: false }),

  // Restore from localStorage
  setBlocks: (blocks) => set({ blocks }),
}));
```

- [ ] **Step 2: Commit store change**

```bash
git add frontend/src/stores/chatStore.js
git commit -m "refactor: chatStore from flat messages to block-based structure"
```

#### Sub-step 5b: Create ChatBlock component

- [ ] **Step 3: Create ChatBlock.jsx**

Create `frontend/src/components/chat/ChatBlock.jsx`:

```jsx
import { marked } from 'marked';

function renderMarkdown(text) {
  return { __html: marked.parse(text || '') };
}

export default function ChatBlock({ block, isStreaming, onExport }) {
  return (
    <div className="border border-ink/10 rounded-lg overflow-hidden">
      {/* Block header */}
      <div className="flex items-center justify-between px-4 py-2 bg-ink/3 border-b border-ink/8">
        <span className="text-xs font-medium text-ink/60">{block.characterName || '未知角色'}</span>
        <button
          onClick={() => onExport?.(block)}
          className="text-[10px] text-ink/30 hover:text-ink/60 transition-colors"
        >
          导出
        </button>
      </div>
      {/* Messages */}
      <div className="px-4 py-3 space-y-3">
        {block.messages.map((msg, i) => (
          <div key={i} className={msg.role === 'user' ? 'text-right' : ''}>
            {msg.role === 'user' ? (
              <p className="inline-block text-sm text-ink/50 max-w-prose text-right">{msg.content}</p>
            ) : (
              <div className="max-w-prose text-sm leading-relaxed">
                {msg.content ? (
                  <div
                    className={`prose prose-sm prose-stone ${msg.error ? 'text-ink/40' : 'text-ink/80'}`}
                    dangerouslySetInnerHTML={renderMarkdown(msg.content)}
                  />
                ) : (
                  isStreaming && i === block.messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-ink/30 animate-pulse ml-0.5 align-text-bottom" />
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit ChatBlock**

```bash
git add frontend/src/components/chat/ChatBlock.jsx
git commit -m "feat: add ChatBlock component for per-character conversation blocks"
```

#### Sub-step 5c: Create ChatExportMenu

- [ ] **Step 5: Create ChatExportMenu.jsx**

Create `frontend/src/components/chat/ChatExportMenu.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore.js';

function formatBlock(block) {
  const header = `=== ${block.characterName} ===\n`;
  const body = block.messages.map(m =>
    m.role === 'user' ? `[你] ${m.content}` : `[${block.characterName}] ${m.content}`
  ).join('\n\n');
  return header + body;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const blocks = useChatStore((s) => s.blocks);

  useEffect(() => {
    if (!open) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (blocks.length === 0) return null;

  const uniqueChars = [...new Map(blocks.map(b => [b.characterId, b.characterName])).entries()];

  function exportAll() {
    const text = blocks.map(formatBlock).join('\n\n---\n\n');
    downloadText('对话记录.txt', text);
    setOpen(false);
  }

  function exportByCharacter(charId, charName) {
    const charBlocks = blocks.filter(b => b.characterId === charId);
    const text = charBlocks.map(formatBlock).join('\n\n---\n\n');
    downloadText(`对话记录-${charName}.txt`, text);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="text-xs text-ink/30 hover:text-ink/60 transition-colors"
      >
        导出对话
      </button>
      {open && (
        <div className="absolute bottom-full right-0 mb-1 bg-white border border-ink/10 rounded-lg shadow-lg py-1 min-w-[120px] z-50">
          <button onClick={exportAll} className="w-full text-left px-3 py-1.5 text-xs text-ink/70 hover:bg-ink/5">
            导出全部
          </button>
          {uniqueChars.length > 1 && (
            <>
              <div className="border-t border-ink/8 my-1" />
              {uniqueChars.map(([charId, charName]) => (
                <button
                  key={charId}
                  onClick={() => exportByCharacter(charId, charName)}
                  className="w-full text-left px-3 py-1.5 text-xs text-ink/70 hover:bg-ink/5"
                >
                  {charName}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Commit ChatExportMenu**

```bash
git add frontend/src/components/chat/ChatExportMenu.jsx
git commit -m "feat: add chat export menu — all blocks or by character"
```

#### Sub-step 5d: Rewrite ChatPane to use blocks

- [ ] **Step 7: Rewrite ChatPane.jsx**

Replace `frontend/src/components/chat/ChatPane.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react';
import { buildContext, streamChat } from '../../api/chat.js';
import { useChatStore } from '../../stores/chatStore.js';
import ChatBlock from './ChatBlock.jsx';
import ChatExportMenu from './ChatExportMenu.jsx';

function downloadBlock(block) {
  const text = block.messages.map(m =>
    m.role === 'user' ? `[你] ${m.content}` : `[${block.characterName}] ${m.content}`
  ).join('\n\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `对话-${block.characterName}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatPane({
  worldId, worldData, playerStatus, currentScene, narrativeMode,
  onTurnComplete, tokenBudget = 4096, characters = [], activeCharacterId,
  apiConfig = {},
}) {
  const {
    blocks, streaming, ensureBlock, addMessage,
    updateLastMessage, getAllMessages, setStreaming,
  } = useChatStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [blocks]);

  const activeChar = characters.find(c => c.id === activeCharacterId);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming || !activeCharacterId) return;

    const blockId = ensureBlock(activeCharacterId, activeChar?.name || '未知');
    const userMsg = { role: 'user', content: text };
    addMessage(blockId, userMsg);
    setInput('');
    setStreaming(true);

    const allMessages = getAllMessages();
    const accRef = { current: '' };
    let streamCompleted = false;

    try {
      const { systemPrompt, trimmedChatHistory } = await buildContext({
        worldCard: worldData,
        chatHistory: allMessages,
        tokenBudget,
        mode: narrativeMode || 'ensemble',
        playerStatus,
        currentScene,
        characters,
        activeCharacters: [activeCharacterId],
      });

      addMessage(blockId, { role: 'assistant', content: '' });

      await streamChat({
        worldId,
        systemPrompt,
        messages: trimmedChatHistory,
        apiConfig,
        onDelta: (delta) => {
          accRef.current += delta;
          updateLastMessage(blockId, accRef.current);
        },
        onDone: () => {
          streamCompleted = true;
          setStreaming(false);
          onTurnComplete?.();
        },
      });
    } catch (err) {
      console.error('[ChatPane] send failed:', err);
      if (!streamCompleted) {
        const detail = err?.message || '未知错误';
        addMessage(blockId, { role: 'assistant', content: `（发生错误: ${detail}）`, error: true });
        setStreaming(false);
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Blocks stream */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {blocks.map((block, i) => (
          <div key={block.id}>
            {/* Transition indicator between blocks */}
            {i > 0 && blocks[i - 1].characterId !== block.characterId && (
              <div className="flex items-center gap-3 py-3">
                <div className="flex-1 border-t border-ink/10" />
                <span className="text-[10px] text-ink/30 shrink-0">
                  切换到与 {block.characterName} 的对话
                </span>
                <div className="flex-1 border-t border-ink/10" />
              </div>
            )}
            <ChatBlock
              block={block}
              isStreaming={streaming && i === blocks.length - 1}
              onExport={downloadBlock}
            />
          </div>
        ))}
        {blocks.length === 0 && (
          <p className="text-xs text-ink/30 text-center py-10">
            {activeCharacterId ? '选择角色后开始对话' : '请先在左侧选择一个角色'}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-ink/8 px-6 py-3 flex gap-3 items-end">
        <textarea
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed placeholder:text-ink/30 focus:outline-none"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={activeCharacterId ? '继续书写…' : '请先选择对话角色'}
          disabled={streaming || !activeCharacterId}
        />
        <ChatExportMenu />
        <button
          className="text-xs text-ink/40 hover:text-ink transition-colors disabled:opacity-30 pb-0.5"
          onClick={handleSend}
          disabled={streaming || !input.trim() || !activeCharacterId}
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Commit ChatPane rewrite**

```bash
git add frontend/src/components/chat/ChatPane.jsx
git commit -m "refactor: ChatPane uses block-based rendering with per-character containers"
```

#### Sub-step 5e: Update WorldPage to wire everything together

- [ ] **Step 9: Update WorldPage — clear chat on scene change, pass activeCharacterId**

In `frontend/src/pages/WorldPage.jsx`:

**a)** Import chatStore:
```javascript
import { useChatStore } from '../stores/chatStore.js';
```

**b)** Get `clearBlocks` and `getAllMessages` from the store (near line 47). Also update `chatMessagesRef` to use the block-based store — **critical for event proposals to keep working**:
```javascript
const { clearBlocks } = useChatStore();

// Replace old: const { messages: chatMessages, streaming: chatStreaming } = useChatStore();
const chatBlocks = useChatStore((s) => s.blocks);
const chatStreaming = useChatStore((s) => s.streaming);
useEffect(() => {
  chatMessagesRef.current = useChatStore.getState().getAllMessages();
}, [chatBlocks]);
```

**c)** Update `handleSceneEnter` to clear chat:
```javascript
  function handleSceneEnter(result) {
    setCurrentScene(result.scene);
    setSelectedCharacterId(null);
    clearBlocks();
    setPlayer((prev) => prev ? { ...prev, status: { ...prev.status, current_location: result.scene.id } } : prev);
  }
```

**d)** Remove the old `activeCharacters` header block (lines 175-181 — the "你正在和 XXX 对话" div). The ChatBlock headers now handle character identification.

**e)** Update ChatPane props — change `activeCharacters` to `activeCharacterId`:
```jsx
          <ChatPane
            worldId={worldId}
            worldData={world}
            playerStatus={player?.status}
            currentScene={currentScene}
            narrativeMode={narrativeMode}
            onTurnComplete={handleTurnComplete}
            tokenBudget={tokenBudget}
            characters={characters}
            activeCharacterId={selectedCharacterId}
            apiConfig={apiConfig}
          />
```

**f)** Update the localStorage save/restore for chat blocks. Replace the existing chat save effect (around line 82-86):
```javascript
  useEffect(() => {
    if (useChatStore.getState().blocks.length === 0 || useChatStore.getState().streaming) return;
    try {
      localStorage.setItem(`world-sim-chat-${worldId}`, JSON.stringify(useChatStore.getState().blocks));
    } catch { /* ignore quota */ }
  }, [worldId, useChatStore((s) => s.blocks)]);
```

Actually, simpler approach — subscribe inside the initial load effect. Replace the chat restore logic in the first useEffect (around lines 51-55) and the save effect (lines 82-86):

Remove old save effect entirely. In the initial useEffect, restore blocks with a **format migration guard** (old sessions stored flat `[{role, content}]` arrays — these lack `messages` field and must be discarded):
```javascript
  useEffect(() => {
    useChatStore.getState().clearBlocks();
    try {
      const stored = JSON.parse(localStorage.getItem(`world-sim-chat-${worldId}`) || '[]');
      // Only restore if it's the new block format (has .messages field)
      if (Array.isArray(stored) && stored.length > 0 && stored[0]?.messages) {
        useChatStore.getState().setBlocks(stored);
      }
      // Old flat message arrays are silently discarded
    } catch { /* ignore */ }
    // ... rest of Promise.all loading
  }, [worldId]);
```

The save effect uses `chatBlocks` and `chatStreaming` which were already declared in step 9b above:
```javascript
  useEffect(() => {
    if (chatBlocks.length === 0 || chatStreaming) return;
    try {
      localStorage.setItem(`world-sim-chat-${worldId}`, JSON.stringify(chatBlocks));
    } catch { /* ignore quota */ }
  }, [worldId, chatBlocks, chatStreaming]);
```

- [ ] **Step 10: Verify build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds.

- [ ] **Step 11: Commit WorldPage wiring**

```bash
git add frontend/src/pages/WorldPage.jsx
git commit -m "feat: wire block-based chat, clear on scene change, remove old character header"
```

---

### Task 6: Final Build Verification

- [ ] **Step 1: Full build check**

```bash
cd frontend && npx vite build
```

- [ ] **Step 2: Run existing tests**

```bash
cd frontend && npx vitest run 2>&1 | tail -30
```

Fix any failures caused by the chatStore API change. Known test files that will break:
- `frontend/src/__tests__/components/chat/ChatPane.test.jsx` — uses `useChatStore.setState({ messages: [] })` which no longer exists; needs `blocks` API; tests must pass `activeCharacterId` prop
- `frontend/src/__tests__/pages/WorldPage.test.jsx` — also uses `useChatStore.setState({ messages: [] })` and tests the old `activeCharacters` prop
- `frontend/src/__tests__/components/world/CharacterSelector.test.jsx` — may need update for empty-state rendering

- [ ] **Step 3: Final commit if test fixes needed**

```bash
git add -A
git commit -m "fix: update tests for block-based chat store"
```
