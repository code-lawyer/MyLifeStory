# AI 驱动世界模拟器 — 设计规格文档

**日期：** 2026-03-21
**基础项目：** SillyTavern v1.16.0
**开发方式：** 保留后端引擎，完全重写前端

---

## 一、产品目标

基于 SillyTavern 构建一个 AI 驱动的纯文字交互世界模拟器，核心体验是：玩家在一个持续演变的世界中与 AI 角色互动，互动产生的事件会永久改变世界状态，影响后续所有 AI 的行为。

**三个核心差异点（相比 SillyTavern）：**
1. 引导式对话生成世界卡和角色卡，用户无需手动填写字段
2. 简化为三种叙事模式，隐藏所有底层技术参数
3. 世界演进系统：对话事件积累为世界历史，持续影响 AI 上下文

---

## 二、整体架构

```
┌─────────────────────────────────────────────┐
│              新前端 (React SPA)              │
│  世界创建向导 │ 主界面 │ 角色管理 │ 世界档案  │
└──────────────────┬──────────────────────────┘
                   │ HTTP / SSE
┌──────────────────▼──────────────────────────┐
│           SillyTavern 后端 (Express)         │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │    新增：world-simulation 模块       │   │
│  │  - 卡片 AI 生成                     │   │
│  │  - 世界事件管理                     │   │
│  │  - 上下文预算分配                   │   │
│  │  - 世界状态同步                     │   │
│  │  - 主角档案与物品栏管理             │   │
│  │  - 场景管理                         │   │
│  └─────────────────────────────────────┘   │
│                                             │
│  原有模块（不修改）                          │
│  characters │ chats │ worldinfo │ openai…   │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   LLM API（外部）    │
        │  Claude / GPT / 等  │
        └─────────────────────┘
```

**设计原则：**
- `world-simulation` 模块作为独立路由挂载，与原有模块平行，不修改原有逻辑
- 原有 `worldinfo`、`characters`、`chats` 存储系统继续使用，新模块在其基础上扩展
- 前端完全重写，通过 REST API 与后端通信

**文件存储结构扩展：**
```
data/users/[username]/
  worlds/             ← 原有，存世界卡（扩展字段，不含事件）
  characters/         ← 原有，存角色卡（扩展字段）
  chats/              ← 原有，存对话历史（按 worldId 关联）
  world-events/
    [worldId].json    ← 新增，每个世界独立一个事件日志文件
  world-summaries/
    [worldId].json    ← 新增，每个世界的压缩历史摘要
  scenes/
    [worldId].json    ← 新增，每个世界的场景列表
  players/
    [worldId].json    ← 新增，每个世界的主角档案
```

**存储分离原则：** 世界卡（WorldCard）仅存储静态设定和当前状态摘要，不嵌入事件日志。事件日志、摘要、场景、主角档案均独立存储，通过 worldId 关联。

---

## 三、核心数据模型

### 3.1 世界卡 WorldCard

```json
{
  "id": "world_001",
  "name": "铁雾城邦",
  "created_at": "2026-03-21T00:00:00Z",

  "foundation": {
    "background": "世界的历史背景与整体描述",
    "geography": "地理环境与主要地区",
    "rules": "世界运行的基本规则（物理、魔法、社会等）"
  },

  "power_system": {
    "description": "力量体系的整体规则，用于约束角色等级，防止 AI 随意开挂",
    "tiers": [
      { "level": 1, "name": "学徒工", "description": "能操控小型机械装置" },
      { "level": 2, "name": "技师", "description": "可驾驶单人战甲" },
      { "level": 3, "name": "工程师", "description": "能设计并操控大型战争机器" }
    ],
    "constraints": "特殊限制条件（如魔法在某地区受压制）",
    "notes": "补充说明"
  },

  "current_state": {
    "summary": "当前世界状态的自然语言摘要，随事件动态更新",
    "updated_at": "2026-03-21T14:30:00Z",
    "event_count": 12
  },

  "mode": "ensemble",
  "active_characters": ["char_001", "char_002"]
}
```

**设计要点：**
- `foundation` 存储不变的世界基础设定，不会被事件覆盖
- `power_system` 独立存储力量体系，注入上下文时约束所有角色行为
- `current_state` 存储动态演变的当前摘要，每次事件确认后 AI 自动重写；`event_count` 用于触发压缩
- 事件日志和压缩摘要独立存储于 `world-events/` 和 `world-summaries/`，世界卡不嵌入事件数组
- `mode` 的合法值为：`intimate`（亲密）、`ensemble`（群像）、`epic`（史诗）

---

### 3.2 角色卡 CharacterCard（扩展现有结构）

```json
{
  "id": "char_001",
  "name": "艾达·沃克",
  "world_id": "world_001",

  "identity": {
    "description": "外貌与基础性格描述",
    "personality": "性格特点",
    "background": "角色背景故事"
  },

  "power_tier": 2,

  "current_state": {
    "relationship_to_player": "盟友，信任度高",
    "status": "正在主导工人组织的武器改造计划"
  },

  "voice": {
    "style": "说话风格描述，用于生成角色时告知 AI 语气特征",
    "example_lines": ["示例台词1", "示例台词2"]
  }
}
```

**设计要点：**
- `identity` 存储固定的角色基础信息
- `current_state` 随世界事件动态更新，与固定性格分开存储
- `power_tier` 对应世界卡的力量体系等级，AI 生成行为时不得超出此限制
- `voice.style` 和 `voice.example_lines` 在上下文构建时注入角色卡预算，帮助 AI 维持角色语气一致性

---

### 3.3 世界事件 WorldEvent（独立存储于 `world-events/[worldId].json`）

```json
{
  "events": [
    {
      "id": "evt_001",
      "world_id": "world_001",
      "timestamp": "2026-03-21T12:00:00Z",
      "title": "南城工人起义",
      "description": "完整事件描述",
      "impact_scope": "major",
      "affected_characters": ["char_001", "char_003"],
      "source_chat_id": "chat_042",
      "confirmed_by_user": true
    }
  ]
}
```

**`impact_scope` 合法值及含义：**

| 值 | 含义 | 用途 |
|----|------|------|
| `minor` | 小事件，仅影响个别角色关系 | 上下文中以简短形式呈现 |
| `moderate` | 中等事件，影响某个地区或势力 | 正常呈现 |
| `major` | 重大事件，影响世界全局走向 | 优先保留，压缩时最后处理 |

**事件压缩触发规则：** 当 `event_count` 超过 30 条时，自动将最早的 20 条事件调用 `/events/compress` 压缩为一条历史摘要，写入 `world-summaries/`。压缩时 `major` 级别事件不被删除，仅进行文本精简。

---

### 3.4 主角档案 PlayerProfile（独立存储于 `players/[worldId].json`）

```json
{
  "id": "player_001",
  "world_id": "world_001",
  "name": "玩家自定义名字",
  "power_tier": 2,
  "description": "主角外貌与背景描述",
  "status": {
    "health": "良好",
    "mental": "疲惫",
    "reputation": "南城工人中颇有威望",
    "current_location": "scene_003"
  },
  "inventory": [
    {
      "id": "item_001",
      "name": "艾达给的机械钥匙",
      "description": "能打开南城仓库的某扇门",
      "from_event": "evt_004"
    }
  ]
}
```

---

### 3.5 场景 Scene（独立存储于 `scenes/[worldId].json`）

```json
{
  "scenes": [
    {
      "id": "scene_001",
      "world_id": "world_001",
      "name": "南城广场",
      "description": "布满煤灰的石板路，工人们在此聚集",
      "accessible_from": ["scene_002", "scene_003"],
      "characters_present": ["char_001"],
      "is_locked": false,
      "unlock_condition": "",
      "unlocked_by_event": ""
    }
  ]
}
```

**场景解锁机制：** `is_locked: true` 的场景在满足以下任一条件时解锁：
1. 用户在世界档案中手动设置 `is_locked: false`
2. 用户确认了一条世界事件，其 `id` 与该场景的 `unlocked_by_event` 字段匹配
- 事件确认后，系统自动检查所有锁定场景，匹配则自动解锁

---

## 四、新增后端模块：world-simulation

挂载路径：`/api/world-sim`

**通用错误处理策略：**
- LLM 调用失败 → 返回 HTTP 502，携带 `{ error: "llm_unavailable", message: "..." }`
- LLM 返回无法解析为目标结构的内容 → 返回 HTTP 422，携带原始文本 `{ error: "parse_failed", raw: "..." }`，前端展示原始文本供用户手动处理
- worldId / characterId 不存在 → 返回 HTTP 404
- 请求体缺少必填字段 → 返回 HTTP 400

---

### 4.1 卡片生成 `/generate`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/generate/world` | POST | 接收用户自由描述，生成世界卡草稿 |
| `/generate/world/refine` | POST | 接收原草稿 + 追加描述，细化指定区块 |
| `/generate/character` | POST | 接收用户自由描述，生成角色卡草稿 |
| `/generate/character/refine` | POST | 细化角色卡指定区块 |

**卡片生成流程：**
1. 用户自由描述 → `/generate/world`
2. 后端构建 prompt，调用 LLM，返回结构化草稿
3. 用户追问细化 → `/generate/world/refine`（带原草稿 + 追加描述）
4. 用户确认后保存至存储

---

### 4.2 世界事件管理 `/events`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/events/:worldId` | GET | 获取事件列表 |
| `/events/:worldId` | POST | 新增已确认事件 |
| `/events/:worldId/:eventId` | DELETE | 删除事件（同步触发 state/update 重新生成摘要） |
| `/events/:worldId/propose` | POST | AI 分析对话，提议新事件 |
| `/events/:worldId/compress` | POST | 压缩旧事件为摘要 |

**`/propose` 工作逻辑：**
- 接收最近一段对话历史
- 调用 LLM 判断是否发生了影响世界的事件
- 若是，返回：
  - `narrative`：叙事化提示文本（"冥冥中，似乎……"）
  - `event_draft`：结构化事件草稿（供确认后直接写入）
- 若否，返回 `null`，前端不显示任何提示

**`/propose` 调用频率控制：**
- 每 3 轮对话触发一次（前端计数，不是每轮都调用）
- 若上一次 `/propose` 调用仍在进行中，跳过本次触发
- 每个世界同一时刻最多一个待确认事件（有未处理的提议时不再发起新提议）

**删除事件后的一致性：** 删除事件后，后端自动调用 `state/update` 重新基于当前剩余事件生成 `current_state.summary`，保持状态一致。

---

### 4.3 上下文预算分配 `/context`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/context/build` | POST | 根据模式组装注入 LLM 的世界上下文 |

**输入：**
```json
{
  "worldId": "world_001",
  "mode": "ensemble",
  "active_characters": ["char_001", "char_002"],
  "chatHistory": [...],
  "tokenBudget": 8192
}
```

**输出：** 按比例分配好的上下文片段，直接可插入 LLM prompt

**三种模式的上下文分配比例：**

| 模式（存储值） | 世界基础+力量体系 | 当前场景 | 主角状态 | 事件日志 | 角色卡 | 对话历史 |
|--------------|----------------|---------|---------|---------|--------|---------|
| `intimate`（亲密） | 8% | 7% | 5% | 8% | 22% | 50% |
| `ensemble`（群像） | 8% | 7% | 5% | 20% | 25% | 35% |
| `epic`（史诗） | 15% | 5% | 5% | 30% | 20% | 25% |

**多角色上下文分配规则：**
- 角色卡预算按 `active_characters` 数量平均分配
- 若单个角色卡超出均分额度，截断至额度上限（保留 identity + power_tier + current_state，voice.example_lines 最后截断）
- `active_characters` 超过 5 个时，仅取前 5 个（按加入场景的顺序）

**超出预算时的处理顺序（优先级从低到高保留）：**
1. 优先用 `archived_summaries` 替换完整 `event_log` 原文
2. 再压缩 `voice.example_lines`
3. 最后压缩对话历史（保留最近 N 条）

---

### 4.4 世界状态同步 `/state`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/state/:worldId` | GET | 获取当前世界状态 |
| `/state/:worldId/update` | POST | 基于当前全部事件重新生成 current_state.summary |

每次用户确认事件或删除事件后调用 `/state/update`，AI 根据最新事件列表重写 `current_state.summary`。

---

### 4.5 主角档案与物品栏 `/player`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/player/:worldId` | GET | 获取主角档案（含物品栏） |
| `/player/:worldId` | POST | 创建主角档案 |
| `/player/:worldId` | PUT | 更新主角档案（全量） |
| `/player/:worldId/status` | PATCH | 更新主角状态字段（health / mental / reputation）；**不含 current_location**，位置变更须通过 `/scenes/.../enter` 以保证锁定验证 |
| `/player/:worldId/inventory` | POST | 添加物品 |
| `/player/:worldId/inventory/:itemId` | DELETE | 删除物品 |

**物品变更时机：** 世界事件确认时，`event_draft` 可携带可选字段 `inventory_changes: { add: [...], remove: [...] }`，前端在用户点击"接受"后一并提交至 `/player/:worldId/inventory`。

---

### 4.6 场景管理 `/scenes`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/scenes/:worldId` | GET | 获取所有场景列表 |
| `/scenes/:worldId` | POST | 创建新场景 |
| `/scenes/:worldId/:sceneId` | GET | 获取单个场景详情 |
| `/scenes/:worldId/:sceneId` | PUT | 更新场景（含手动解锁） |
| `/scenes/:worldId/:sceneId` | DELETE | 删除场景 |
| `/scenes/:worldId/:sceneId/enter` | POST | 玩家进入场景（更新 PlayerProfile.current_location，返回该场景的角色列表） |

**场景进入逻辑：**
- 调用 `/enter` 时，后端验证场景是否已解锁
- 若解锁 → 更新 `PlayerProfile.current_location`，返回 `characters_present` 和场景描述
- 若锁定 → 返回 HTTP 403，携带 `{ unlock_condition: "..." }`，前端展示提示

---

## 五、前端架构

### 5.1 技术选型

| 技术 | 选择 | 理由 |
|------|------|------|
| 框架 | React + Vite | 组件化适合多状态视图，Vite 开发体验好 |
| 状态管理 | Zustand | 轻量，无 Redux 复杂度 |
| 样式 | Tailwind CSS | 快速构建，易于定制主题 |

**Zustand Store 划分：**
- `worldStore`：当前世界卡数据、当前叙事模式（`intimate` / `ensemble` / `epic`）
- `characterStore`：角色列表、当前场景中的活跃角色
- `chatStore`：对话历史、流式输出状态、当前对话与世界的关联
- `eventStore`：待确认事件、事件日志、propose 调用计数器与进行中状态
- `playerStore`：主角档案、物品栏、当前位置
- `sceneStore`：场景列表、当前场景

### 5.2 页面路由

```
/                    # 世界列表（首页）
/create/world        # 世界卡创建向导
/create/character    # 角色卡创建向导（须关联 worldId）
/world/:worldId      # 主界面（含对话、世界档案、角色管理）
/settings            # 全局设置（API Key、语言、主题）
```

**对话与世界的关联：** 每个世界有唯一的活跃对话线程，存储于 `chats/` 中以 `worldId` 为前缀命名。进入 `/world/:worldId` 时自动加载或创建对应的对话。

### 5.3 主界面布局

```
┌──────────────────────────────────────────────────────┐
│  [铁雾城邦]        [亲密/群像/史诗]      [世界档案]   │  ← 顶栏
├──────────┬───────────────────────────────────────────┤
│          │                                           │
│ 场景角色 │           对  话  区  域                  │
│          │                                           │
│[艾达·沃克]│  艾达："给我三天……"                      │
│[格雷厄姆] │  你："我们需要更快。"                     │
│          │  艾达："那就两天。"                        │
│          │                                           │
│          │   ┌──────────────────────────┐            │
│          │   │ 冥冥中，似乎发生了一件    │            │
│          │   │ 足以影响世界的大事……      │            │
│          │   │        [接受]  [忽略]     │            │
│          │   └──────────────────────────┘            │
│          ├───────────────────────────────────────────┤
│[🗺 地图] │                                           │
│[👤 档案] │  [输入框]                       [发送]    │
│[🎒 背包] │                                           │
└──────────┴───────────────────────────────────────────┘
```

**左栏底部三个图标按钮，点击后以浮层面板展开，再次点击或点击空白处关闭：**

| 按钮 | 展开内容 |
|------|---------|
| 🗺 地图 | 场景节点图，可点击切换位置，锁定场景灰显并提示解锁条件 |
| 👤 档案 | 主角状态（体力/声望/位置）与背景描述，可手动编辑 |
| 🎒 背包 | 物品列表，点击单件查看详情与来源事件 |

---

## 六、核心用户流程

### 流程一：创建世界

```
1. 首页点击"创建新世界"→ 进入创建向导
2. 用户自由输入描述（无字数限制）
3. AI 生成草稿，分区块展示：
   基础设定 / 力量体系 / 当前状态
4. 用户对任意区块点击"细化"
   → 追问对话框 → AI 更新该区块
5. 全部满意后"确认创建"
   → 自动跳转至角色创建，或直接进入世界
```

### 流程二：创建角色

```
1. 进入角色创建向导（关联到当前世界）
2. 用户自由描述角色概念
3. AI 生成角色卡草稿（含力量等级建议，参考世界力量体系）
4. 用户逐块确认或细化
5. 保存角色，关联到当前世界
```

### 流程三：对话与世界演进

```
1. 进入世界，选择叙事模式（亲密/群像/史诗）
2. 选择当前场景和参与对话的角色（active_characters）
3. 正常对话
4. 每 3 轮对话后，若无进行中的 propose 且无待确认事件：
   → 后台静默调用 /events/propose
5. 若 AI 判断有重大事件：
   - 对话区底部浮现叙事化提示卡片
   - 若事件含物品变更，卡片中一并展示获得/失去的物品
   - 用户点击"接受"→ 事件写入日志，world current_state 更新，物品栏同步
   - 用户点击"忽略"→ 卡片消失，不记录
6. 后续 AI 回复自动感知已更新的世界状态
```

### 流程四：场景切换

```
1. 点击左栏🗺图标，展开地图浮层
2. 用户点击目标场景节点
3. 前端调用 /scenes/:worldId/:sceneId/enter
4. 若未锁定 → 切换成功，PlayerProfile.current_location 更新，
              在场角色列表更新为该场景的 characters_present
5. 若锁定 → 提示解锁条件，保持当前位置不变
6. 切换场景后，场景描述注入上下文，AI 自然感知玩家当前位置
```

### 流程五：查看世界档案

```
1. 点击顶栏"世界档案"
2. 展示：当前状态摘要 / 事件时间线 / 角色列表 / 力量体系 / 场景列表
3. 可手动编辑任意字段
4. 可手动添加或删除事件
   → 删除后系统自动重新生成 current_state.summary
```

---

## 七、隐藏的系统行为（用户不可见）

| 后台发生的事 | 用户感知到的 |
|------------|------------|
| 上下文预算计算与裁剪 | 正常的 AI 回复 |
| 每 3 轮对话触发 propose 检查 | 叙事化提示卡片（或无） |
| 旧事件压缩为摘要（超过 30 条时） | 无感知 |
| 世界状态 current_state 重写 | 世界档案里的描述更新了 |
| 力量体系注入上下文 | AI 不会随意让角色超出能力范围 |
| 场景切换时上下文重组 | AI 自然提及当前环境 |
| 事件删除后摘要重新生成 | 世界档案状态描述自动更新 |
| 事件确认时物品栏同步 | 背包里出现或消失了物品 |

---

## 八、开发范围边界

**保留不动（SillyTavern 原有）：**
- 所有 LLM API 接入层（openai.js、anthropic.js 等）
- 角色卡、世界卡、对话历史的文件存储基础格式
- 用户认证与多用户系统
- SSE 流式输出机制

**新增（world-simulation 模块）：**
- 卡片 AI 生成子系统（`/generate`）
- 世界事件管理子系统（`/events`）
- 上下文预算分配子系统（`/context`）
- 世界状态同步子系统（`/state`）
- 主角档案与物品栏 API（`/player`）
- 场景管理 API（`/scenes`）

**完全重写（前端）：**
- 所有 HTML/CSS/JS 界面
- 替换为 React + Vite + Zustand + Tailwind CSS
