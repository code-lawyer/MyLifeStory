# 玩家状态漂移设计文档

**日期：** 2026-03-25
**功能：** 事件确认后自动更新玩家 health / mental / reputation

---

## 背景

玩家属性（`status.health`、`status.mental`、`status.reputation`，0-100 数值）目前只能手动编辑，事件和对话不会自动影响它们。本功能在每次玩家直接参与的事件确认后，由 LLM 自动计算属性变化量并更新。

---

## 触发条件

事件的 `affected_characters` 数组包含特殊标记 `"__player__"` 时触发。该标记由 LLM 在生成事件草稿时决定是否写入，前端无需额外处理。

---

## 数据流

```
handleEventAccepted()
  → eventDraft.affected_characters?.includes('__player__')
       是 → fire-and-forget: playerApi.drift(worldId, eventDraft, player.status, apiConfig)
                → POST /api/world-sim/player/:worldId/drift
                → 后端读 player → 调用 LLM → 解析 delta JSON
                → 叠加 + clamp(0, 100) → writePlayer()
                → 返回更新后的 player
              ← if (mountedRef.current) setPlayer(updatedPlayer)
       否 → 跳过
```

---

## 后端

### 新增路由

**文件：** `src/endpoints/world-simulation/player.js`

**端点：** `POST /player/:worldId/drift`

**请求体：**
```json
{
  "event": { "title": "...", "description": "...", "affected_characters": ["__player__", "..."] },
  "currentStatus": { "health": 80, "mental": 60, "reputation": 50 },
  "apiConfig": { ... }
}
```

**流程：**
1. 读取 player（`readPlayer`）— 不存在返回 `404 player_not_found`
2. 组装 LLM prompt：
   - **system：** `你是命运裁判。根据事件，用JSON输出玩家三项属性的变化量。格式：{"health":N,"mental":N,"reputation":N}，N为整数，范围-20~+20。只输出JSON，不要解释。`
   - **user：** 当前 health/mental/reputation 值 + 事件标题和描述
3. 调用 `callLLM`，`JSON.parse` 响应
4. 对每个字段：`newVal = Math.min(100, Math.max(0, current + delta))`
5. `writePlayer` 写入更新后的 player
6. 返回更新后的 player

**错误处理：**
- LLM 返回非法 JSON → 静默降级，返回 `200 + { player }` 原始数据，不写入
- 字段缺失（LLM 仅返回部分字段）→ 缺失字段 delta 视为 0
- `404 player_not_found` → 返回 `{ error: 'player_not_found' }`

**依赖：** `callLLM`（已在 `player.js` 中使用或需新增 import）、`readPlayer`、`writePlayer`

---

## 前端

### `frontend/src/api/player.js`

新增 `drift` 方法：
```js
drift: (worldId, event, currentStatus, apiConfig) =>
  apiFetch(`${BASE}/player/${worldId}/drift`, {
    method: 'POST',
    body: JSON.stringify({ event, currentStatus, apiConfig }),
  }),
```

### `frontend/src/pages/WorldPage.jsx`

在 `handleEventAccepted` 末尾，现有 npc-drift fire-and-forget 之后添加：
```js
// Fire-and-forget: update player status if event affects player
if (eventDraft.affected_characters?.includes('__player__')) {
  playerApi.drift(worldId, eventDraft, player?.status, apiConfig)
    .then((updatedPlayer) => { if (mountedRef.current) setPlayer(updatedPlayer); })
    .catch((err) => console.warn('[WorldPage] player-drift failed:', err.message));
}
```

需在文件顶部确认 `playerApi` 已导入。

---

## 修改文件清单

| 文件 | 变更类型 |
|------|---------|
| `src/endpoints/world-simulation/player.js` | 新增路由 `POST /:worldId/drift` |
| `frontend/src/api/player.js` | 新增 `drift` 方法 |
| `frontend/src/pages/WorldPage.jsx` | 新增 fire-and-forget 触发逻辑 |

---

## 不在范围内

- 修改事件生成 prompt（`"__player__"` 的写入由现有 LLM 自主决定）
- `PlayerProfilePanel` 改动（通过 `player` prop 自动反映新值）
- 玩家 inventory 变化
