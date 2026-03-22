# 引导流程 & NPC 分级系统 设计文档

**日期:** 2026-03-23
**状态:** 已批准

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

## 3. 引导流程设计

### 3.1 完整五步流程

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

### 3.2 规模与生成数量

| 规模 | 传奇 | 精英 | 普通 | 无用模板 | 场景 | Token 预估 |
|------|------|------|------|----------|------|------------|
| 小   | 2    | 3    | 5    | 5        | 6    | ~3,000     |
| 中   | 3    | 7    | 12   | 8        | 15   | ~10,000    |
| 大   | 5    | 15   | 30   | 15       | 35   | ~25,000    |

> 核心人物（用户手动创建）不占以上配额，由 AI 根据主角小传中的关系权重自动标记为传奇或精英级别。

### 3.3 步骤③：主角小传 → 核心人物提取

- 用户在文本框中写主角小传（自由文本，无字数限制）
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
- 用户在步骤④中逐一处理这些建议

### 3.4 步骤④：核心人物创建

- 逐一展示 AI 建议，调用现有 `POST /api/world-sim/generate/character` 预填草稿
- 用户可编辑所有字段，也可整体跳过某个人物
- 全部处理完后进入步骤⑤

### 3.5 步骤⑤：批量生成进度

- 调用 `POST /api/world-sim/generate/bulk-npcs` 和 `POST /api/world-sim/generate/scenes`（SSE）
- 实时显示进度：已生成 N / 共 M 个，当前正在生成的名称
- 完成后显示汇总卡片（传奇 X 个 / 精英 X 个 / 普通 X 个 / 场景 X 个）
- 点击「进入世界」跳转 WorldPage

---

## 4. NPC 分级系统

### 4.1 四级定义

| 等级 | 英文 key | 定位 |
|------|----------|------|
| 传奇 | `legendary` | 剧情核心角色，有完整个人弧线 |
| 精英 | `elite` | 重要配角，有性格和立场 |
| 普通 | `normal` | 背景人物，有姓名和简短描述 |
| 无用 | `disposable` | 可复用模板，无独立身份 |

### 4.2 各级数据字段

| 字段 | 传奇 | 精英 | 普通 | 无用 |
|------|------|------|------|------|
| 姓名 | ✓ | ✓ | ✓ | 职位名（如「守卫」） |
| 身份描述 | 详细（~200字） | 标准（~80字） | 简短（~30字） | 通用模板描述 |
| 个性 | ✓ | ✓ | — | — |
| 背景故事 | ✓ | — | — | — |
| 力量等级 | ✓ | ✓ | — | — |
| 声线/台词样本 | ✓（3条） | ✓（1条） | — | — |
| 与主角关系 | ✓（详细） | ✓（简短） | ✓（一词） | — |

### 4.3 无用级复用机制

无用级 NPC 使用职位名作为模板（如「守卫」「店主」「路人」），`is_template: true`，不绑定特定场景，任意场景均可引用同一模板描述。

---

## 5. 数据模型变更

### 5.1 World（新增字段）

```javascript
{
  scale: 'small' | 'medium' | 'large',
  onboarding_complete: boolean,
  protagonist_bio: string,
}
```

### 5.2 Character（新增字段）

```javascript
{
  tier: 'legendary' | 'elite' | 'normal' | 'disposable',
  is_core: boolean,      // 用户在引导流程中手动创建
  is_template: boolean,  // 无用级可复用模板
}
```

---

## 6. 后端接口

### 新增接口

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/world-sim/generate/protagonist` | 分析主角小传，返回核心人物建议列表 |
| POST | `/api/world-sim/generate/bulk-npcs` | SSE 批量生成 NPC（按规模分批） |
| POST | `/api/world-sim/generate/scenes` | SSE 批量生成场景列表 |

### SSE 格式（bulk-npcs / scenes）

```
data: {"type":"progress","done":3,"total":15,"item":{...npc or scene}}
data: {"type":"done","summary":{"legendary":2,"elite":3,...}}
```

### 修复 403 错误

- 定位 `server-startup.js` 中 `/api/world-sim` 路由挂载位置
- 确认 CSRF 中间件对 world-sim 路由的豁免配置
- 若未豁免则添加，使 `/api/world-sim/*` 路由正常处理 POST/PATCH/DELETE

---

## 7. 前端变更

### 7.1 页面与路由

| 路由 | 页面 | 变更 |
|------|------|------|
| `/create/world` | `CreateWorldPage` | 新增规模选择器（步骤①②） |
| `/world/:id/setup` | `SetupPage`（新建） | 引导向导步骤③④⑤ |
| `/world/:id` | `WorldPage` | 检查 `onboarding_complete`，未完成跳转 setup |

### 7.2 新增组件

| 组件 | 路径 | 用途 |
|------|------|------|
| `ScaleSelector` | `components/wizard/ScaleSelector.jsx` | 规模选择卡片，显示 token 预估 |
| `ProtagonistBioStep` | `components/setup/ProtagonistBioStep.jsx` | 步骤③ |
| `CoreNpcStep` | `components/setup/CoreNpcStep.jsx` | 步骤④ |
| `BulkGenerateStep` | `components/setup/BulkGenerateStep.jsx` | 步骤⑤ 实时进度 |

### 7.3 API 客户端

- `frontend/src/api/worlds.js`：`generateDraft` 加 `scale` 参数
- `frontend/src/api/generate.js`（新建）：封装三个新生成接口，`bulk-npcs` 和 `scenes` 使用 SSE

---

## 8. 实现顺序

1. 修复 403 CSRF 错误（解锁现有功能）
2. 数据模型加 `scale` / `tier` / `onboarding_complete` 字段
3. 后端：`generate/protagonist` 接口
4. 后端：`generate/bulk-npcs` + `generate/scenes` SSE 接口
5. 前端：`ScaleSelector` 组件 + `CreateWorldPage` 集成
6. 前端：`SetupPage` 三步向导（步骤③④⑤）
7. 前端：`WorldPage` 入口检查 + 地图/角色面板数据修复

---

## 9. 不在本次范围内

- NPC 对话树 / 分支剧情
- NPC 在场景间的自动移动
- 场景专属战斗/探索系统
- 关系值数值化追踪
