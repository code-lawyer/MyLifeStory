# World State Narration Design

## Goal

每次事件被玩家确认后，自动调用 LLM 重写世界的 `current_state.summary`，使世界状态随剧情演进而动态更新，下一轮对话上下文即可感知最新世界状态。

## Architecture

采用前端触发方案：事件确认成功后，前端 fire-and-forget 调用新的 `/narrate` 接口。后端读取世界背景与当前摘要，结合新事件调用 LLM，重写摘要后存盘并返回更新后的世界对象。失败时静默忽略，游戏不阻塞。

更新后的世界对象直接回写到 `WorldPage.world`，该值已经作为 `worldData` 传入 ChatPane → `buildContext`，下一轮对话的系统提示中即包含新摘要，形成完整的叙事反馈循环。

## Components

### 后端：`POST /api/world-sim/worlds/:worldId/narrate`

**位置：** `src/endpoints/world-simulation/worlds.js`

**请求体：**
```json
{
  "event": { "title": "...", "description": "...", "impact_scope": "minor|moderate|major" },
  "apiConfig": {}
}
```

**流程：**
1. 校验 `event.title` 存在
2. 读取当前世界文件，取 `foundation.background`（世界背景）与 `current_state.summary`（当前摘要）
3. 构造提示词（见下），调用 LLM
4. 将返回的新摘要写回 `world.current_state.summary`，同时更新 `world.current_state.last_updated`（ISO 时间戳）
5. 存盘，返回完整更新后的世界对象

**LLM 系统提示词：**
```
你是世界叙事者。根据世界背景、当前状态和最新事件，用2~3句中文重写当前状态摘要。
只输出摘要文本，不要标题、不要解释。
```

**用户消息：**
```
世界背景：{foundation.background}

当前状态：{current_state.summary}

最新事件（{impact_scope}）：{title} — {description}
```

**错误处理：**
- LLM 不可用 → `502 llm_unavailable`
- 事件字段缺失 → `400 missing_fields`
- 存储失败 → `500 internal_error`

### 前端：`worldsApi.narrate()`

**位置：** `frontend/src/api/worlds.js`

```js
narrate: (worldId, event, apiConfig) =>
  apiFetch(`/api/world-sim/worlds/${worldId}/narrate`, {
    method: 'POST',
    body: JSON.stringify({ event, apiConfig }),
  }),
```

### 前端：`handleEventAccepted` 触发叙事

**位置：** `frontend/src/pages/WorldPage.jsx`

在现有 `setWorld(freshWorld)` 之后追加（fire-and-forget）：

```js
worldsApi.narrate(worldId, eventDraft, apiConfig)
  .then((narratedWorld) => setWorld(narratedWorld))
  .catch((err) => console.warn('[WorldPage] narrate failed:', err.message));
```

## Data Flow

```
用户确认事件
  → eventsApi.confirm()
  → handleEventAccepted: 刷新 player/world
  → worldsApi.narrate(event)  [fire-and-forget]
      → 后端读世界 + 调 LLM
      → 写回 current_state.summary
      → 返回更新世界
  → setWorld(narratedWorld)
  → 下一次 buildContext 调用包含新摘要
```

## Files Modified

| 文件 | 变更 |
|------|------|
| `src/endpoints/world-simulation/worlds.js` | 新增 `POST /:worldId/narrate` 路由 |
| `frontend/src/api/worlds.js` | 新增 `narrate` 方法 |
| `frontend/src/pages/WorldPage.jsx` | `handleEventAccepted` 追加叙事触发 |

## Testing

- 后端：确认事件后 `current_state.summary` 和 `last_updated` 被更新
- 前端：LLM 失败时游戏正常继续，不报错弹窗
- 集成：新摘要在下一次聊天的系统提示中可见（通过 `buildContext` 返回的 `systemPrompt` 验证）
