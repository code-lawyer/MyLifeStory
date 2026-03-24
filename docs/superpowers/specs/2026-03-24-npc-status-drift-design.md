# NPC Status Drift Design

## Goal

每次事件被玩家确认后，自动调用 LLM 更新受影响的活跃角色的 `current_state.status`，使 NPC 状态随剧情演进而动态变化。

## Architecture

前端触发批量更新方案：事件确认后，前端 fire-and-forget 调用新的 `/npc-drift` 接口，传入事件对象和当前活跃角色 ID 列表。后端取交集（事件的 `affected_characters` ∩ `activeCharacterIds`），对每个命中角色并行调用 LLM 更新状态，写回文件，返回更新后的角色数组。前端 merge 更新本地 `characters` state。

"活跃角色"定义：`visibleCharacters`（当前场景中的角色，或 legendary/elite 级别的角色），沿用 WorldPage 已有逻辑。

## Components

### 后端：`POST /api/world-sim/worlds/:worldId/npc-drift`

**位置：** `src/endpoints/world-simulation/worlds.js`（追加到文件末尾，复用已有的 `callLLM` import 和 `vId` 中间件）

**请求体：**
```json
{
  "event": { "title": "...", "description": "...", "impact_scope": "minor|moderate|major", "affected_characters": ["id1", "id2"] },
  "activeCharacterIds": ["id1", "id3"],
  "apiConfig": {}
}
```

**流程：**
1. 校验 `event.title` 存在，`activeCharacterIds` 为非空数组，否则返回 `400 missing_fields`
2. 取交集：`targetIds = event.affected_characters.filter(id => activeCharacterIds.includes(id))`
3. 若交集为空，返回 `{ updated: [] }`（无需调用 LLM）
4. 对每个 `targetId` 并行执行：
   a. 读取角色文件；若不存在则跳过
   b. 构造 LLM 用户消息（见下）
   c. 调用 LLM；若失败则跳过该角色（不影响其他）
   d. `.trim()` + 非空校验；空则跳过
   e. 写回 `current_state.status` + `current_state.last_updated`（ISO 时间戳）
5. 返回 `{ updated: [char1, char2, ...] }`（去掉 `hidden_traits`，仅包含实际更新的角色）

**LLM 系统提示：**
```
你是世界叙事者。根据事件和角色当前状态，用1~2句中文更新角色的当前状态描述。只输出状态文本，不要标题、不要解释。
```

**LLM 用户消息：**
```
角色：{char.name}
当前状态：{char.current_state?.status || '（正常）'}
性格：{char.identity?.personality || ''}
事件（{event.impact_scope}）：{event.title} — {event.description || ''}
```

**错误处理：**
- 缺少 `event.title` 或 `activeCharacterIds` → `400 missing_fields`
- 交集为空 → `200 { updated: [] }`（正常响应）
- 单个角色文件不存在 → 跳过
- 单个角色 LLM 失败 → 跳过（console.warn）
- 存储失败 → `500 internal_error`

### 前端：`worldsApi.npcDrift()`

**位置：** `frontend/src/api/worlds.js`

```js
npcDrift: (worldId, event, activeCharacterIds, apiConfig) =>
  apiFetch(`${BASE}/worlds/${worldId}/npc-drift`, {
    method: 'POST',
    body: JSON.stringify({ event, activeCharacterIds, apiConfig }),
  }),
```

### 前端：`handleEventAccepted` 触发漂移

**位置：** `frontend/src/pages/WorldPage.jsx`

在 `worldsApi.narrate(...)` 调用之后追加（fire-and-forget，含 mountedRef 保护）：

```js
// Fire-and-forget: update affected NPC statuses
const activeCharacterIds = visibleCharacters.map(c => c.id);
worldsApi.npcDrift(worldId, eventDraft, activeCharacterIds, apiConfig)
  .then(({ updated }) => {
    if (!mountedRef.current || updated.length === 0) return;
    setCharacters(prev => prev.map(c => {
      const u = updated.find(u => u.id === c.id);
      return u ? { ...c, current_state: u.current_state } : c;
    }));
  })
  .catch((err) => console.warn('[WorldPage] npc-drift failed:', err.message));
```

注意：`visibleCharacters` 是组件内已有的派生值（lines 169-177），无需重新计算。

## Data Flow

```
用户确认事件
  → eventsApi.confirm()
  → handleEventAccepted: 刷新 player/world
  → worldsApi.narrate(event)         [fire-and-forget]
  → worldsApi.npcDrift(event, activeIds)  [fire-and-forget]
      → 后端取交集
      → 并行读角色 + 调 LLM + 写回
      → 返回 { updated: [...] }
  → setCharacters merge 更新        [仅在组件仍挂载时]
  → 下次 buildContext 使用更新后的角色数据
```

## Files Modified

| 文件 | 变更 |
|------|------|
| `src/endpoints/world-simulation/worlds.js` | 新增 `POST /:worldId/npc-drift` 路由 |
| `frontend/src/api/worlds.js` | 新增 `npcDrift` 方法 |
| `frontend/src/pages/WorldPage.jsx` | `handleEventAccepted` 追加 npcDrift 触发 |

## Testing

- 后端：确认事件后，`affected_characters` 中的活跃角色的 `current_state.status` 和 `last_updated` 被更新；不在 `activeCharacterIds` 中的角色不被更新
- 前端：LLM 失败时游戏正常继续；`characters` state 中只有实际更新的角色被 merge
- 边界：交集为空时无 LLM 调用，返回 `{ updated: [] }`
