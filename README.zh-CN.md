# Downcity

[English](./README.md) | [简体中文](./README.zh-CN.md)

> 把一个代码仓库启动成可对话、可执行、可观测的 Agent Runtime。

Downcity 是一个面向本地项目与团队工作流的 Agent 平台。它把代码仓库、模型、会话、工具、服务、插件和控制面组合在一起，让一个项目可以拥有长期运行的 Agent、可追踪的执行记录，以及可扩展的用户界面。

## 为什么是 Downcity

- Repo Native：代码仓库本身就是 Agent 的上下文、记忆边界和执行空间。
- 平台与执行内核解耦：`@downcity/studio-cli` 负责平台与宿主管理，`@downcity/agent` 负责单 Agent 运行时。
- 长期运行能力：支持 daemon 化运行、状态检查、历史追踪，以及 CLI / Console 双入口操作。
- 可观测性优先：会话、日志、运行状态和操作面都可以被检查和追踪。
- 可扩展架构：services、plugins、SDK API 和 UI 组件都作为明确边界对外开放。

## 仓库组成

| 包 / 目录 | 作用 |
| --- | --- |
| `@downcity/studio-cli` | 平台层与 CLI，负责 city runtime、Console gateway、多 Agent 注册、模型池、全局配置与 daemon 管理。 |
| `@downcity/agent` | 单 Agent runtime 与 SDK，负责 session、tool loop、service、plugin、HTTP/RPC、sandbox 与宿主接入。 |
| `@downcity/city` | 城市基础设施运行时，负责 service 注册、action、auth、env、product 访问边界与 HTTP 路由。 |
| `@downcity/services` | 城市公共服务，负责 accounts、balance、usage、payment 与 Stripe 支付闭环。 |
| `@downcity/gate` | 面向用户端与管理端的 HTTP 调用 SDK。 |
| `@downcity/ui` | React + Tailwind UI SDK，提供 Console 与宿主应用可复用的界面组件。 |
| `cities/*` | 可部署街区，用于把 infra 与 services 组装成 Node 或 Edge 运行形态。 |
| `products/chrome-extension` | Chrome Extension，用于连接 Console、页面上下文和 Inline Composer。 |
| `homepage` | 官网与面向用户的文档站点。 |

## 核心能力

- Repo is the Agent：初始化项目后生成 `PROFILE.md`、`SOUL.md`、`downcity.json` 和 `.downcity/`。
- City 控制面：通过 `studio start` 或 `studio console` 管理运行时和多个 Agent。
- Agent 生命周期管理：创建、启动、停止、重启、诊断、对话、查看历史。
- 全局模型池：通过 `studio model` 管理 provider 与 model，并把项目绑定到模型 ID。
- City Infra：通过 `@downcity/city`、`@downcity/services`、`@downcity/gate` 和可部署的 `cities/*`，让多个产品复用同一套服务基建。
- 内建 Services：`chat`、`task`、`memory`、`shell`、`contact`。
- 内建 Plugins：`skill`、`auth`、`web`、`asr`、`tts`、`workboard`。
- SDK 接入：支持本地嵌入式 Agent 和远程 HTTP Agent。

## 快速开始

### 1. 安装 CLI

```bash
npm install -g @downcity/studio-cli
# 或
npm install -g downcity
# 或
pnpm add -g @downcity/studio-cli
# 或
pnpm add -g downcity
```

安装完成后，下面两个命令等价：

```bash
studio --version
downstudio --version
```

`@downcity/studio-cli` 与 `downcity` 发布的是同一份 CLI 内容。`studio update` 会按你当前全局安装来源更新对应的包。

### 2. 初始化平台

```bash
studio init
```

该命令会初始化 Downcity 的全局配置和存储，默认位于 `~/.downcity/`。

### 3. 配置模型

```bash
studio model create
studio model list
studio model use <modelId>
studio model test model <modelId>
```

`studio` 会把 `downcity.json.execution.modelId` 解析成运行时 `LanguageModel`，再注入到 Agent session 中。

### 4. 创建 Agent 项目

在目标仓库中执行：

```bash
studio agent create .
```

初始化后会创建或更新：

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

### 5. 启动 Agent 并对话

```bash
studio agent start .
studio agent status .
studio agent chat -m "总结一下这个项目"
```

如果希望在当前终端前台运行：

```bash
studio agent start . --foreground
```

### 6. 启动 Console

```bash
studio start --console
# 或
studio console
```

常用状态命令：

```bash
studio status
studio agent list
studio console status
```

## SDK 示例

### 本地 Agent

```ts
import { Agent } from "@downcity/agent";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
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

const turn = await session.prompt({
  query: "总结一下当前仓库结构",
});
const result = await turn.finished;

console.log(result.text);
```

在 SDK 模式下，模型由宿主应用自己创建，再注入到 session。`@downcity/agent` 不负责 provider / modelId 的解析。

### 远程 Agent

```ts
import { RemoteAgent } from "@downcity/agent";

const agent = new RemoteAgent({
  baseUrl: "http://127.0.0.1:15314",
});

const session = await agent.session();
const turn = await session.prompt({
  query: "检查最近一次任务执行状态",
});
const result = await turn.finished;

console.log(result.text);
```

## 仓库结构

```text
downcity/
├── packages/
│   ├── agent/
│   ├── city/
│   ├── conduit/
│   ├── infra/
│   ├── services/
│   └── ui/
├── cities/
│   ├── edge/
│   ├── node/
│   └── shared/
├── products/
│   └── chrome-extension/
├── homepage/
├── scripts/
├── package.json
└── pnpm-workspace.yaml
```

## 文档入口

- 产品文档：[downcity.ai/docs](https://downcity.ai/docs)
- City 文档：[downcity.ai/docs/city](https://downcity.ai/docs/city)
- Agent SDK 文档：[downcity.ai/agent-sdk-docs](https://downcity.ai/agent-sdk-docs)
- UI SDK 文档：[downcity.ai/ui-sdk-docs](https://downcity.ai/ui-sdk-docs)
- 开发文档：[downcity.ai/devdocs](https://downcity.ai/devdocs)
- 包文档：[packages/agent/README.md](./packages/agent/README.md)、[packages/city/README.md](./packages/city/README.md)、[packages/services/README.md](./packages/services/README.md)、[packages/gate/README.md](./packages/gate/README.md)、[packages/studio-cli/README.md](./packages/studio-cli/README.md)、[packages/ui/README.md](./packages/ui/README.md)

## 本地开发

安装依赖：

```bash
pnpm install
```

构建：

```bash
pnpm build
pnpm build:agent
pnpm build:city
pnpm build:homepage
pnpm build:extension
```

类型检查：

```bash
pnpm typecheck
pnpm -C packages/ui typecheck
pnpm -C homepage typecheck
```

开发模式：

```bash
pnpm dev:city
pnpm dev:agent
pnpm dev:ui-sdk
pnpm dev:console
pnpm dev:homepage
```

## 运行与安全建议

- Downcity 会执行 shell、读写项目文件、启动本地 daemon，并可能通过聊天渠道接收外部消息。
- 建议在干净 Git 分支上使用，并通过 `git status`、`git diff` 审计改动。
- 不要把真实密钥提交到仓库；优先使用本地环境变量或 `studio env`。
- 通过 token 和 auth 边界保护 Console、HTTP 访问和聊天渠道接入。
- 在需要时通过 sandbox 配置收紧命令执行边界。
