# MyLifeStory

一个基于 AI 的世界模拟与互动叙事系统。玩家可以创建世界、设计 NPC、推进事件，由 LLM 驱动叙事演化。

## 技术栈

- **后端**：Node.js + Express
- **前端**：React 18 + Vite + Zustand
- **测试**：Jest（72 个测试全部通过）
- **存储**：本地 JSON 文件（按用户隔离）
- **LLM**：兼容 OpenAI Chat Completions API 的任意模型

## 核心功能

### 世界管理
- 创建、编辑、删除世界
- 世界状态自动叙事更新（事件确认后由 LLM 生成世界摘要）

### NPC 与角色
- 按 tier（传奇 / 精英 / 普通）生成 NPC
- 每个 NPC 有公开属性与隐藏特征（dark side），好感度 ≥ 90 时解锁
- 角色关系网络，支持好感度追踪

### 事件系统
- LLM 驱动的事件提案与确认机制
- 事件确认后自动触发：关系漂移、玩家状态漂移、NPC 状态漂移、场景解锁
- 事件达到阈值时自动压缩归档为摘要

### 场景与地图
- 场景锁定 / 解锁（由特定事件触发）
- 角色分布于不同场景，影响上下文过滤

### 玩家系统
- 玩家状态（生命值、声望、位置、背包）
- 事件后自动状态漂移

### AI 上下文构建
- 智能上下文裁剪（budget 机制），适配模型 token 限制
- 支持亲密模式（intimate）与群体模式（ensemble）

## 快速开始

### 环境要求

- Node.js ≥ 18
- 一个兼容 OpenAI API 的 LLM 服务（如 OpenAI、本地 Ollama 等）

### 安装

```bash
git clone https://github.com/code-lawyer/MyLifeStory.git
cd MyLifeStory
npm install
```

### 构建前端

```bash
npm run build:frontend
```

> 构建输出写入 `public/assets/`，服务器提供静态文件服务。

### 启动服务器

```bash
npm start
```

默认监听 `http://localhost:8000`，浏览器打开即可使用。

### 配置

编辑根目录的 `config.yaml`：

```yaml
port: 8000          # 监听端口
listen: false       # false = 仅本机，true = 对外暴露
dataRoot: ./data    # 数据存储目录
```

LLM 连接参数（API URL、Key、模型名）在前端设置页面中配置，保存至用户数据目录。

## 项目结构

```
MyLifeStory/
├── src/
│   ├── endpoints/
│   │   ├── world-simulation/   # 核心业务逻辑
│   │   │   └── storage/        # JSON 文件存储层
│   │   ├── secrets.js          # API 密钥管理
│   │   ├── settings.js         # 全局设置
│   │   └── users-*.js          # 用户认证
│   ├── middleware/             # Express 中间件
│   ├── server-main.js          # 服务器入口与中间件配置
│   └── server-startup.js       # 路由注册
├── frontend/
│   └── src/
│       ├── pages/              # 页面组件
│       ├── components/         # 可复用 UI 组件
│       ├── stores/             # Zustand 状态
│       └── api/                # API 客户端
├── tests/
│   └── world-simulation/       # Jest 测试（14 套件，72 用例）
├── docs/superpowers/           # 设计规范与实现计划
├── server.js                   # 启动入口
└── config.yaml                 # 服务器配置
```

## API 端点

所有世界模拟 API 挂载在 `/api/world-sim/`：

| 路径 | 功能 |
|------|------|
| `GET /health` | 健康检查 |
| `/worlds` | 世界 CRUD |
| `/characters` | 角色 CRUD |
| `/events/:worldId` | 事件列表 / 新增 / 删除 / 提案 / 压缩 |
| `/scenes/:worldId` | 场景管理与进入 |
| `/relationships/:worldId` | 关系与好感度漂移 |
| `/player/:worldId` | 玩家状态与背包 |
| `/state/:worldId` | 世界状态叙事更新 |
| `/generate/*` | AI 生成（世界、角色、NPC、场景） |
| `/context/build` | 构建 LLM 上下文 |
| `/chat/:worldId` | SSE 流式对话 |

## 开发

```bash
# 运行全部测试
npm test

# 仅运行世界模拟测试
npm run test:ws

# 代码检查
npm run lint

# 前端开发模式（热重载，代理后端 8000）
cd frontend && npm run dev
```

## 许可证

AGPL-3.0
