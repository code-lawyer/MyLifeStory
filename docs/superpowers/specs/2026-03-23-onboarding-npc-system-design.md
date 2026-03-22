# 引导流程 & NPC 分级系统 设计文档

**日期:** 2026-03-23
**状态:** 已批准（v3，二次规格审查后修订）

---

## 1. 背景与目标

当前问题：
- 进入世界后地图空白、角色空白，发言返回 403 错误
- 没有引导流程，用户不知道如何初始化世界内容
- 没有 NPC 分级，无法自动批量生成世界内容

目标：设计一套完整的世界初始化引导流程，包括世界规模选择、主角小传驱动的核心人物创建、AI 批量生成 NPC 与场景，以及 NPC 四级分类体系。

---

## 2. 功能范围

1. **世界规模选择** — 创建世界时选小/中/大，显示 token 消耗预估
2. **五步引导向导** — 世界创建完成后的完整初始化流程
3. **NPC 分级系统** — 四个等级，各有不同数据深度
4. **AI 批量生成** — 根据世界背景 + 规模，SSE 流式生成 NPC 和场景
5. **修复 403 错误** — 进入世界后发言的 CSRF Forbidden 错误

---

## 3. 修复 403 CSRF 错误

### 根本原因

`csrfSynchronisedProtection` 作为全局中间件安装（`server-main.js` ~line 194），早于 `/api/world-sim` 路由注册。前端的 `apiFetch`（`client.js`）已在每次 mutating 请求前自动获取并注入 `x-csrf-token` 头，这部分工作正常。

**真正的问题**：聊天接口使用 SSE（`text/event-stream`），前端通过原生 `fetch` 直接发起，**跳过了 `apiFetch` 的 CSRF token 注入**，导致请求缺少 `x-csrf-token` 头。

### 修复方案

**不要**豁免 `/api/world-sim/*` 的 CSRF 检查（会引入安全漏洞）。

而是在所有 SSE 的原生 `fetch` 调用前，先调用 `apiFetch` 获取 CSRF token 并手动注入：

```javascript
// frontend/src/api/sse-client.js（新建）
export async function fetchSSE(url, body, onChunk) {
  // 先获取 CSRF token（与 apiFetch 相同逻辑）
  const csrf = await fetch('/csrf-token').then(r => r.json()).then(d => d.token);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`SSE error: ${response.status}`);
  // 读取 SSE 流
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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
}
```

所有现有 SSE 调用（聊天、新增的批量生成）均改用 `fetchSSE`。

---

## 4. 引导流程设计

### 4.1 完整五步流程

```
[CreateWorldPage]
  步骤①  选择世界规模（小 / 中 / 大）
  步骤②  描述世界 → AI 生成世界设定（现有流程，加 scale 参数）
          → 确认创建 → 跳转 /world/:id/setup

[SetupPage · /world/:id/setup]
  步骤③  写主角小传 → AI 提取核心人物建议列表
  步骤④  逐一创建核心人物（AI 预填草稿，用户可编辑 / 跳过）
  步骤⑤  AI 批量生成普通 NPC + 场景（SSE 实时进度）
          → 完成，跳转 /world/:id
```

### 4.2 规模与生成数量

| 规模 | 传奇 | 精英 | 普通 | 无用模板 | 场景 | Token 预估 |
|------|------|------|------|----------|------|------------|
| 小   | 2    | 3    | 5    | 5        | 6    | ~3,000     |
| 中   | 3    | 7    | 12   | 8        | 15   | ~10,000    |
| 大   | 5    | 15   | 30   | 15       | 35   | ~25,000    |

> 核心人物（用户手动创建）不占以上配额，由 AI 根据主角小传关系权重自动标记为传奇或精英级别。

### 4.3 步骤③：主角小传 → 核心人物提取

- 用户在文本框中写主角小传（自由文本）
- 调用 `POST /api/world-sim/generate/protagonist`
- 后端用 LLM 分析小传，返回建议核心人物列表：
  ```json
  {
    "core_npcs": [
      { "name": "赫敏·格兰杰", "relationship": "最好的朋友", "suggested_tier": "legendary" },
      { "name": "伏地魔", "relationship": "终极对手", "suggested_tier": "legendary" }
    ]
  }
  ```

### 4.4 步骤④：核心人物创建

- 逐一展示 AI 建议，调用 `POST /api/world-sim/generate/character`（**扩展此接口**，加入 `tier` 和 `relationship` 参数，写入 system prompt）
- 现有接口扩展签名：`{ description, worldContext, tier?, relationship? }`
- 用户可编辑所有字段，也可整体跳过某个人物
- 全部处理完后进入步骤⑤

### 4.5 步骤⑤：批量生成进度

- 调用 `POST /api/world-sim/generate/bulk-npcs` 和 `POST /api/world-sim/generate/scenes`（均使用 `fetchSSE`）
- 实时显示进度：已生成 N / 共 M 个
- **SSE 错误事件**：若某个 NPC/场景生成失败，发送 `{"type":"error","index":3,"message":"..."}` 后**跳过该项继续**（不中断整个流程）
- Express 响应设置 `res.setTimeout(0)` 禁用默认超时（大世界生成可能超过 2 分钟）
- 完成后显示汇总（传奇 X / 精英 X / 普通 X / 场景 X），点击「进入世界」

---

## 5. NPC 分级系统

### 5.1 四级定义

| 等级 | 英文 key | 定位 |
|------|----------|------|
| 传奇 | `legendary` | 剧情核心角色，有完整个人弧线 |
| 精英 | `elite` | 重要配角，有性格和立场 |
| 普通 | `normal` | 背景人物，有姓名和简短描述 |
| 无用 | `disposable` | 可复用模板，无独立身份 |

### 5.2 各级数据字段

| 字段 | 传奇 | 精英 | 普通 | 无用 |
|------|------|------|------|------|
| 姓名 | ✓ | ✓ | ✓ | 职位名（如「守卫」） |
| 身份描述 | 详细（~200字） | 标准（~80字） | 简短（~30字） | 通用模板描述 |
| 个性 | ✓ | ✓ | — | — |
| 背景故事 | ✓ | — | — | — |
| 力量等级 | ✓ | ✓ | — | — |
| 声线/台词样本 | ✓（3条） | ✓（1条） | — | — |
| 与主角关系 | ✓（详细） | ✓（简短） | ✓（一词） | — |

### 5.3 无用级复用机制

无用级 NPC 使用职位名作为模板，`is_template: true`，不绑定特定场景，跨场景共享同一模板描述。

---

## 6. 数据模型变更

### 6.1 World（新增字段）

```javascript
{
  scale: 'small' | 'medium' | 'large',
  onboarding_complete: boolean,   // 缺失时默认视为 true（兼容已有世界）
  protagonist_bio: string,
}
```

**兼容策略**：`WorldPage` 中判断 `world.onboarding_complete === false`（严格判断），`undefined` 视为已完成，避免已存在的世界被重定向到引导流程。

### 6.2 Character（新增字段）

```javascript
{
  tier: 'legendary' | 'elite' | 'normal' | 'disposable',
  is_core: boolean,      // 用户在引导流程中手动创建
  is_template: boolean,  // 无用级可复用模板
}
```

---

## 7. 后端接口

### 7.1 新增接口（均添加到现有 `generate.js`）

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/world-sim/generate/protagonist` | 分析主角小传，返回核心人物建议列表 |
| POST | `/api/world-sim/generate/bulk-npcs` | SSE 批量生成 NPC（每生成一个写入存储并推送进度） |
| POST | `/api/world-sim/generate/scenes` | SSE 批量生成场景（同上） |

所有新路由添加到现有 `src/endpoints/world-simulation/generate.js`，不新建路由文件。

### 7.2 SSE 事件格式

```
data: {"type":"progress","done":3,"total":15,"item":{...npc or scene}}
data: {"type":"error","index":3,"message":"生成失败，已跳过"}
data: {"type":"done","summary":{"legendary":2,"elite":3,"normal":5,"disposable":3,"scenes":6}}
```

### 7.3 批量生成策略

- 每个 NPC/场景单独发起一次 LLM 调用
- 每次 LLM 返回后**立即写入存储**（`writeCharacter` / `writeScene`），然后推送 `progress` 事件
- 写入失败推送 `error` 事件后继续，不中断
- 大世界（65个）连续写入约 100 次文件 I/O，当前文件存储结构可接受

---

## 8. 前端变更

### 8.1 页面与路由

| 路由 | 页面 | 变更 |
|------|------|------|
| `/create/world` | `CreateWorldPage` | 新增 `ScaleSelector`（步骤①② ） |
| `/world/:id/setup` | `SetupPage`（新建） | 引导向导步骤③④⑤ |
| `/world/:id` | `WorldPage` | 严格判断 `onboarding_complete === false` 才跳转 setup |

### 8.2 `scale` 状态管理

`scale` 由 `CreateWorldPage` 自行管理（`useState`），不进入 `useDraftWizard` hook。保存时在 `saveFn` 闭包中从外部 `scale` 状态读取并注入到 `worldToSave` 对象。

**注意**：`saveFn` **不得**用 `useCallback` 或 `useMemo` 包裹，否则会形成过期闭包，捕获到 `scale` 的初始值而非最新值。当前代码未使用 memoization，实现时应保持此约定。

### 8.3 WorldPage 中的 setup 跳转时机

跳转逻辑放在 `WorldPage` 数据加载完成后的 `useEffect` 中，位于 `Promise.all`（加载 world / player / scenes / characters）resolve 之后：

```javascript
useEffect(() => {
  if (world && world.onboarding_complete === false) {
    navigate(`/world/${worldId}/setup`, { replace: true });
  }
}, [world]);
```

使用 `replace: true` 避免用户按返回键又回到 WorldPage 触发循环跳转。跳转发生后提前 return，不渲染弹窗。

### 8.4 setup 向导与现有初始化弹窗的关系

引导流程（`SetupPage`）步骤④完成后会**预创建玩家角色**，步骤⑤完成后会**预创建初始场景**。因此 `WorldPage` 中的 `InitPlayerModal` 和 `InitScenesModal` 在引导完成后不会触发（数据已存在）。两个弹窗**保留不删除**，作为兜底（用于直接进入未完成引导的旧世界）。

### 8.5 App.jsx 路由变更

在 `frontend/src/App.jsx` 中，在 `/world/:worldId` 路由**之前**插入：

```jsx
<Route path="/world/:worldId/setup" element={<SetupPage />} />
```

顺序必须在 `/world/:worldId` 前，避免被通配符路由提前匹配。

### 8.6 `onboarding_complete` 写回

- **创建时**：`CreateWorldPage.saveFn` 在 `worldToSave` 中写入 `onboarding_complete: false`
- **完成时**：`SetupPage` 步骤⑤结束后调用 `worldsApi.update(worldId, { onboarding_complete: true })`，再跳转 `/world/:worldId`

若 `update` 调用失败，不阻塞跳转，但下次进入 WorldPage 会再次跳转到 setup（可接受）。

### 8.7 新增组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `ScaleSelector` | `components/wizard/ScaleSelector.jsx` | 规模选择卡片，显示 token 预估 |
| `ProtagonistBioStep` | `components/setup/ProtagonistBioStep.jsx` | 步骤③ |
| `CoreNpcStep` | `components/setup/CoreNpcStep.jsx` | 步骤④ |
| `BulkGenerateStep` | `components/setup/BulkGenerateStep.jsx` | 步骤⑤ 实时进度，处理 error 事件 |

### 8.8 SSE 客户端

新建 `frontend/src/api/sse-client.js`，封装带 CSRF token 的 SSE 请求（见第 3 节）。现有聊天 SSE 调用和新的批量生成调用均使用此模块。

---

## 9. 实现顺序

1. 新建 `sse-client.js`，修复现有聊天 403 错误
2. 数据模型加 `scale` / `tier` / `is_core` / `is_template` / `onboarding_complete` 字段
3. 后端：扩展 `generate/character` 支持 `tier` + `relationship` 参数
4. 后端：新增 `generate/protagonist` 接口
5. 后端：新增 `generate/bulk-npcs` + `generate/scenes` SSE 接口（含 `res.setTimeout(0)`）
6. 前端：`ScaleSelector` 组件 + `CreateWorldPage` 集成（`scale` 独立状态）
7. 前端：`SetupPage` 三步向导（步骤③④⑤），路由注册到 `App.jsx`
8. 前端：`WorldPage` 入口检查（严格判断 `=== false`）

---

## 10. 不在本次范围内

- NPC 对话树 / 分支剧情
- NPC 在场景间的自动移动
- 场景专属战斗/探索系统
- 关系值数值化追踪
