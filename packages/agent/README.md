# @downcity/agent

`@downcity/agent` 是 Downcity 的单 Agent 运行时包。

它负责把一个 agent 项目目录装配成可执行运行时，包括：

- 本地 SDK：`Agent`、`Session`、`RemoteAgent`
- 内部执行内核：history、system、tool loop、增量输出
- Plugin 框架：hook、action、内建插件
- 运行时实现：RPC runtime、sandbox、host

`downcity` 负责多 Agent 管理、控制面网关、平台 CLI、共享模型目录接入与 daemon 进程管理；`@downcity/agent` 只负责单 Agent 的执行面。

## 包定位

- 面向单个 Agent 项目的执行面
- 对外通过 `@downcity/agent` 根入口暴露公共 API
- 负责 session SDK、executor 内核、plugin、sandbox、RPC runtime、SDK 本地 Agent
- 不负责多 Agent registry、control plane daemon、console UI 聚合和平台级编排

## 与其他包的边界

- `@downcity/agent`
  - 单 Agent runtime
  - 单 Agent RPC runtime
  - session SDK、executor 内核、plugin 框架、sandbox
  - 本地 SDK facade
- `downcity`
  - 多 Agent registry
  - control plane / gateway
  - 平台 CLI、共享模型目录接入、模型运行时绑定、全局 env、channel account store
  - agent daemon 进程管理
- `@downcity/ui`
  - React UI 组件与展示层

## 根目录结构

```text
packages/agent
├── bin/                # 构建输出目录
├── scripts/            # 构建辅助脚本
├── src/                # 源码目录
├── package.json        # 包信息、导出面、脚本
├── README.md           # 包结构说明
└── tsconfig.json       # TypeScript 配置
```

## 当前源码结构

```text
src/
├── index.ts               # 包公开入口，集中导出外部可依赖的 API 与协议类型
├── agent/                 # Agent SDK 入口，按 local / remote 拆分本地与远程实现
│   ├── local/             # 本地 Agent facade 与实例装配中心
│   └── remote/            # RemoteAgent facade、RemoteSession 与 HTTP/RPC transport
├── config/                # 项目环境、运行路径、execution binding 与初始化脚手架
│   └── project/           # Agent 项目初始化与项目初始化类型
├── executor/              # 内部执行内核，负责历史、system、tool loop、增量输出与消息持久化
├── plugin/                # 插件系统，负责插件注册、hook、action、内建插件与插件类型
├── rpc/                   # Agent 本机 RPC runtime，对外 HTTP gateway 由 downcity 提供
├── runtime/               # 运行时实现细节层，统一收纳 host / sandbox / control 等内部能力
│   ├── host/              # 宿主注入能力协议
│   └── sandbox/           # 命令沙箱与沙箱协议
├── session/               # SDK session actor、metadata、落盘路径、持久化与 runtime 端口适配
├── types/                 # 跨模块共享协议类型，集中放置 common / config / runtime 等稳定契约
└── utils/                 # 低层工具，负责 CLI、日志、存储与模板辅助
```

## 顶层目录职责

- `src/config/`
  - 项目配置、项目级路径解析与项目初始化
  - `project/` 收口 agent 项目脚手架与初始化结果类型
  - 负责项目 `.env`、`.downcity/*` 路径规则与 execution binding

- `src/agent/`
  - SDK facade 层
  - `local/Agent.ts` 负责本地 Agent 实例装配、plugin/session/RPC 生命周期
  - `remote/RemoteAgent.ts` 负责远程 Agent 客户端入口
  - `remote/RemoteSession.ts` 负责远程 session actor 与 turn lifecycle
  - `remote/transports/*` 负责 HTTP/RPC transport 适配

- `src/executor/`
  - 内部执行内核
  - `Session` 是 SDK 用户面对的会话整体，`Executor` 是内部单轮执行引擎
  - Store 负责 history 事实源落盘，Composer 是可替换的 session 阶段策略协议，负责定义 system / history / context / compaction 等执行阶段逻辑
  - `Executor.prepareExecuteInput()` 串起四类 Composer，`Executor.runCoreEngine()` 负责进入模型 tool loop
  - 负责 history、system、context、CoreEngine、增量输出与消息持久化

- `src/plugin/`
  - 插件框架与内建插件
  - `core/` 负责注册、启用态、hook 调度、本地 action
  - `builtins/` 放 `auth`、`chat`、`contact`、`memory`、`shell`、`skill`、`task`、`web`、`asr`、`tts`、`voice`、`workboard` 等内建插件
  - `types/` 放插件公共协议类型

- `src/runtime/`
  - 单 Agent 的运行时实现细节层
  - `host/` 放宿主注入能力协议
  - `sandbox/` 放命令执行隔离与沙箱协议
  - `control/` 放 runtime 控制面内部协议与处理器
- `src/rpc/` 放 Agent 本机 RPC runtime；HTTP gateway 由 downcity CLI 基于 RPC 转发提供
- 模型实例解析不在 `agent` 包内完成，而由宿主先创建 `LanguageModel`，再通过 `new Agent({ model })` 或 `session.set({ model })` 注入
- `model` 也可以接收 City City 返回的 `CityModel`，Agent 会在内部适配成 AI SDK `LanguageModel`

- `src/types/`
  - 跨模块、跨包共享协议类型
  - `common/` 放 JSON、模板等无领域依赖的基础类型
  - `config/` 放 LLM、execution binding、plugin 配置、start options 等宿主配置契约
  - `runtime/` 放 auth、agent、host、platform 等运行时与控制面共享协议
  - 领域内部类型仍保留在对应领域目录，例如 `plugin/types/`、`executor/types/`

- `src/utils/`
  - 包内通用工具、日志、CLI 输出与存储辅助

## 模块核心与依赖方向

`@downcity/agent` 的核心是一条单 Agent 执行链：

```text
入口协议 -> Agent facade -> AgentContext -> Session / Executor / Plugin -> Runtime 子系统 -> History / Reply
```

其中：

- `agent/local` 与 `agent/remote` 是用户 API 面
- `Agent` facade 是实例级装配中心
- `session / executor / plugin` 是三大核心分层
- `runtime` 是 control / sandbox / host 这类实现细节的统一容器
- `types / utils` 提供横向公共支撑
