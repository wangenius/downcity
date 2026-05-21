# Downcity

> 把一个代码仓库启动成可对话、可执行、可观测的 Agent Runtime。

Downcity 是一个面向本地项目与团队工作流的 Agent 平台。它把代码仓库、模型、会话、工具、服务、插件和控制面组合在一起，让一个项目可以拥有长期运行的 Agent、可追踪的执行记录，以及可扩展的用户界面。

当前仓库是 monorepo，主要包含：

- `@downcity/city`：平台层与 CLI，负责 city runtime、Console 网关、多 Agent 注册、模型池、模型实例创建、全局配置与 daemon 管理。
- `@downcity/agent`：单 Agent runtime，负责 session、tool loop、service、plugin、HTTP/RPC、sandbox 与 SDK；它只消费宿主注入的 `LanguageModel`，不解析 provider/modelId。
- `@downcity/ui`：React + Tailwind UI SDK，提供 Console 和宿主应用可复用的界面组件。
- `products/console`：控制面 Console 前端。
- `products/chrome-extension`：Chrome Extension，用于连接 Console、页面上下文和 Inline Composer。
- `homepage`：官网与用户文档站点。

## 核心能力

- **Repo is the Agent**：项目目录就是 Agent 的工作上下文，初始化后会生成 `PROFILE.md`、`SOUL.md`、`downcity.json` 和 `.downcity/` 运行目录。
- **City 控制面**：`city start` 管理 city runtime，`city console` 启动控制面模块，Console 聚合多个 Agent 的状态和操作入口。
- **Agent daemon 管理**：`city agent create/start/stop/restart/status/chat/history/doctor/reset` 覆盖单项目 Agent 的生命周期。
- **全局模型池**：`city model` 管理 provider 与 model，city 宿主负责把 `downcity.json.execution.modelId` 解析成 `LanguageModel` 后注入 Agent session。
- **配置与密钥管理**：`city config`、`city env`、`city token` 分别管理项目配置、平台环境变量和本机访问 token。
- **内建 Services**：`chat`、`task`、`memory`、`shell`、`contact` 提供聊天通道、任务调度、记忆、命令执行和联系人能力。
- **内建 Plugins**：`skill`、`auth`、`web`、`asr`、`tts`、`workboard` 提供技能加载、授权、联网适配、语音识别、语音合成和运行观测面板。
- **SDK 接入**：`@downcity/agent` 暴露 `Agent`、`RemoteAgent`、`Session` 等 API，支持本地嵌入式和远程 HTTP 调用。
- **UI SDK**：`@downcity/ui` 提供按钮、表单、浮层、反馈、Workboard 等组件与样式入口。

## 快速开始

### 1. 安装 CLI

```bash
npm install -g @downcity/city
# 或
pnpm add -g @downcity/city
```

安装后可使用两个等价命令：

```bash
city --version
downcity --version
```

### 2. 初始化 city 全局配置

```bash
city init
```

该命令会初始化 city 全局配置与存储，默认写入 `~/.downcity/downcity.db`。

### 3. 配置模型池

```bash
city model create
```

`city model create` 会引导你创建 Provider，并可从 Provider 发现远端模型后加入全局模型池。后续由 city 宿主把 Agent 项目的模型 ID 解析成运行时可用的 `LanguageModel`。

常用模型命令：

```bash
city model list
city model use <modelId>
city model test model <modelId>
```

### 4. 创建 Agent 项目

在目标仓库中执行：

```bash
city agent create .
```

初始化会创建或更新：

```text
your-project/
├── PROFILE.md
├── SOUL.md
├── downcity.json
├── .agents/
│   └── skills/
└── .downcity/
    ├── cache/
    ├── config/
    ├── data/
    ├── debug/
    ├── logs/
    ├── profile/
    ├── public/
    ├── schema/
    ├── session/
    └── tasks/
```

### 5. 启动并对话

```bash
city agent start .
city agent status .
city agent chat -m "总结一下这个项目的结构"
```

如果希望在当前终端前台运行：

```bash
city agent start . --foreground
```

### 6. 启动 Console

```bash
city start --console
# 或
city console
```

常用运行状态命令：

```bash
city status
city agent list
city console status
```

## 配置文件

### downcity.json

项目级配置默认保持最小化。一个典型配置如下：

```json
{
  "$schema": "./.downcity/schema/downcity.schema.json",
  "name": "my-project",
  "version": "1.0.0",
  "execution": {
    "type": "api",
    "modelId": "default"
  },
  "plugins": {
    "skill": {
      "enabled": true,
      "paths": [".agents/skills"],
      "allowExternalPaths": false
    }
  },
  "services": {
    "chat": {
      "channels": {
        "telegram": {
          "enabled": true
        }
      }
    }
  }
}
```

关键字段：

- `execution.modelId`：绑定 city 全局模型池中的模型 ID；只由 city 这类宿主解析，`@downcity/agent` SDK 本身不读取模型池。
- `plugins`：配置项目启用的插件和插件私有选项。
- `services.chat.channels`：配置 Telegram、Feishu、QQ 等聊天渠道。
- `sandbox`：配置 shell / CLI 执行边界。
- `context.messages`：配置会话上下文压缩与归档策略。

### PROFILE.md 与 SOUL.md

- `PROFILE.md`：Agent 的角色、目标、边界和沟通方式。
- `SOUL.md`：Agent 的基础人格和长期行为倾向。

这两个文件会参与 system prompt 组合，适合写用户可理解的行为规范，而不是代码实现细节。

## CLI 入口

```bash
city init                         # 初始化 city 全局配置
city start --console              # 启动 city runtime，并同时启动 Console
city stop                         # 停止 city runtime、Console 和受管 Agent
city restart                      # 重启 city runtime 并恢复已运行 Agent
city status                       # 查看 city、Console、Agent 状态

city agent create .               # 初始化当前项目为 Agent 项目
city agent start .                # 后台启动 Agent daemon
city agent chat -m "..."          # 一次性向 Agent 发送消息
city agent doctor . --fix         # 诊断并清理僵尸 daemon 状态

city model create                 # 创建 Provider 或 Model
city model list                   # 查看模型池
city env list                     # 查看平台环境变量键名
city config get                   # 读取 downcity.json
city token create <name>          # 创建本机访问 token
city service list                 # 查看服务
city plugin list                  # 查看插件
```

更多命令以本地 CLI 为准：

```bash
city --help
city agent --help
city model --help
city service --help
city plugin --help
```

## SDK 使用

### 本地 Agent

```ts
import { Agent } from "@downcity/agent";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!
});

const agent = new Agent({
  id: "repo-helper",
  path: "/path/to/project",
  tools: {},
});

const session = await agent.session();
await session.set({
  model: openai.responses("gpt-5"),
});

const result = await session.run({
  query: "总结一下当前仓库结构"
});

console.log(result.text);
```

本地 SDK 模式下，模型由宿主项目自己创建并通过 `session.set({ model })` 注入。`@downcity/agent` 不提供默认模型，也不读取 `downcity.json.execution.modelId`。

如果需要把同一个 Agent 实例暴露成长期运行服务，可以显式启动 HTTP/RPC：

```ts
await agent.start({
  http: {
    host: "127.0.0.1",
    port: 15314,
  },
  rpc: true,
});
```

`new Agent(...)` 只在当前进程内创建实例；`agent.start(...)` 只启动该实例的 services、HTTP 和本地 RPC 能力，不会自动创建子进程。一个 Agent 一个进程的隔离由宿主负责，`city agent start` 会通过 daemon 管理为项目拉起独立子进程。

### 远程 Agent

```ts
import { RemoteAgent } from "@downcity/agent";

const agent = new RemoteAgent({
  baseUrl: "http://127.0.0.1:15314"
});

const session = await agent.session();
const result = await session.run({
  query: "检查最近一次任务执行状态"
});

console.log(result.text);
```

## 工作区结构

```text
downcity/
├── packages/
│   ├── agent/              # 单 Agent runtime、SDK、service、plugin、session、sandbox
│   ├── city/               # CLI、控制面、daemon、registry、多 Agent 管理
│   └── ui/                 # React + Tailwind UI SDK
├── products/
│   ├── console/            # Console 前端应用
│   └── chrome-extension/   # Chrome Extension
├── homepage/               # 官网与用户文档
├── scripts/                # 构建、发布和辅助脚本
├── package.json
└── pnpm-workspace.yaml
```

包边界：

- `@downcity/city` 不重复实现单 Agent 执行逻辑；执行内核来自 `@downcity/agent`。
- `@downcity/city` 负责平台模型池与模型工厂，把 provider/modelId 解析成 `LanguageModel` 后交给 Agent session。
- `@downcity/agent` 只通过根入口暴露公共 API；包外不要依赖内部子路径。
- `@downcity/agent` 不拥有默认模型策略；SDK 调用方必须在 session 运行前显式注入模型。
- `@downcity/ui` 只承载可复用 UI 原语与 Workboard 相关组件。
- Homepage 面向用户文档；开发者结构说明保留在子包 README 和源码模块注释中。

## 本地开发

### 安装依赖

```bash
pnpm install
```

### 构建

```bash
pnpm build
pnpm build:agent
pnpm build:city
pnpm build:homepage
pnpm build:extension
```

### 类型检查

```bash
pnpm typecheck
pnpm -C packages/ui typecheck
pnpm -C homepage typecheck
```

### 开发模式

```bash
pnpm dev:city
pnpm dev:agent
pnpm dev:ui-sdk
pnpm dev:console
pnpm dev:homepage
```

### 发布辅助

```bash
pnpm build:packages
pnpm agent:patch:build
pnpm city:patch:build
pnpm all:patch:build
```

## 文档入口

仓库内当前主要文档在 `homepage/content` 和各包 README 中：

- City 用户文档：`homepage/content/docs/zh/index.mdx`
- Agent SDK 文档：`homepage/content/agent-sdk-docs/zh/index.mdx`
- UI SDK 文档：`homepage/content/ui-sdk-docs/zh/index.mdx`
- 开发文档：`homepage/content/devdocs/zh/index.mdx`
- Agent 包结构：`packages/agent/README.md`
- City 包结构：`packages/city/README.md`

本地启动文档站：

```bash
pnpm dev:homepage
```

## 运行与安全建议

Downcity 会执行 shell、读写项目文件、启动本地 daemon，并可能通过聊天渠道接收外部消息。建议：

- 在干净 Git 分支上使用 Agent，并通过 `git status` / `git diff` 审计改动。
- 通过 `city token` 管理 Console 和 HTTP 访问 token。
- 通过 auth plugin 管理聊天渠道中的用户授权。
- 通过 `sandbox` 配置收紧 shell / CLI 执行边界。
- 不要把真实密钥写入仓库；优先使用 `city env` 或本地环境变量。

## 设计原则

1. **Repo is the Agent**：仓库提供上下文、规则、记忆和执行空间。
2. **Runtime is observable**：会话、日志、状态和 Workboard 快照应可追踪。
3. **Platform and agent are separated**：city 管平台，agent 管单项目执行。
4. **Services and plugins are explicit**：用户能力通过 service / plugin 边界扩展。
5. **Keep configuration small**：项目配置只写必要字段，模型和密钥放到平台层。
