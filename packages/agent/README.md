# @downcity/agent

`@downcity/agent` 是 Downcity 的单 Agent 运行时包。

它负责把一个 agent 项目目录装配成可执行运行时，包括：

- 本地 SDK：`Agent`、`Session`、`RemoteAgent`
- 内部执行内核：history、system、tool loop、增量输出
- Plugin 框架：hook、action、内建插件
- 运行时实现：HTTP/RPC server、transport、sandbox、host

`@downcity/city` 负责多 Agent 管理、控制面网关、平台 CLI、模型池与 daemon 进程管理；`@downcity/agent` 只负责单 Agent 的执行面。

## 包定位

- 面向单个 Agent 项目的执行面
- 对外通过 `@downcity/agent` 根入口暴露公共 API
- 负责 session SDK、executor 内核、plugin、sandbox、HTTP/RPC server、SDK 本地 Agent
- 不负责多 Agent registry、control plane daemon、console UI 聚合和平台级编排

## 与其他包的边界

- `@downcity/agent`
  - 单 Agent runtime
  - 单 Agent HTTP/RPC server
  - session SDK、executor 内核、plugin 框架、sandbox
  - 本地 SDK facade
- `@downcity/city`
  - 多 Agent registry
  - control plane / gateway
  - 平台 CLI、模型池、模型工厂、全局 env、channel account store
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
├── config/                # 配置与项目初始化，负责 downcity.json、默认配置、execution binding 与脚手架
│   └── project/           # Agent 项目初始化与项目初始化类型
├── core/                  # 单 Agent 运行时装配中心，负责 AgentCore / AgentContext
├── executor/              # 内部执行内核，负责历史、system、tool loop、增量输出与消息持久化
├── plugin/                # 插件系统，负责插件注册、hook、action、内建插件与插件类型
├── runtime/               # 运行时实现细节层，统一收纳 host / sandbox / server / transport
│   ├── host/              # 宿主注入能力与 daemon 协议
│   ├── sandbox/           # 命令沙箱与沙箱协议
│   ├── server/            # HTTP / RPC 服务端实现
│   └── transport/         # 调用端 transport 协议与 RPC client
├── sdk/                   # 本地 SDK facade，提供 Agent / RemoteAgent / Session 等高层 API
│   └── session/           # SDK session 的 metadata、落盘路径、持久化与 runtime 端口适配
├── types/                 # 跨模块共享协议类型，集中放置 common / config / runtime 等稳定契约
└── utils/                 # 低层工具，负责 CLI、日志、存储与模板辅助
```

## 顶层目录职责

- `src/config/`
  - 项目配置、项目级路径解析与项目初始化
  - `project/` 收口 agent 项目脚手架与初始化结果类型
  - 负责 `downcity.json`、项目 env、`.downcity/*` 路径规则与 execution binding

- `src/core/`
  - 单 Agent 装配中心
  - `AgentCore` 负责把 config、session SDK、executor、plugin、runtime 组装成一个实例级执行内核
  - `AgentContext` 提供统一能力面，供 session / executor / plugin 复用

- `src/sdk/`
  - 本地 SDK facade
  - 包括 `Agent`、`RemoteAgent`、`Session` 与 `sdk/session/*`
  - `Agent.ts` 通过 `start()/stop()` 统一收口长期运行生命周期
  - `sdk/session/*` 负责 SDK session metadata、落盘路径、持久化与 runtime 端口适配

- `src/executor/`
  - 内部执行内核
  - `Session` 是 SDK 用户面对的会话整体，`Executor` 是内部单轮执行引擎
  - Store 负责 history 事实源落盘，Composer 是纯 interface 协议，负责组装 system / history / context / compaction
  - `Executor.prepareExecuteInput()` 串起四类 Composer，`Executor.runCoreEngine()` 负责进入模型 tool loop
  - 负责 history、system、context、CoreEngine、增量输出与消息持久化

- `src/plugin/`
  - 插件框架与内建插件
  - `core/` 负责注册、启用态、hook 调度、本地 action
  - `builtins/` 放 `auth`、`chat`、`contact`、`memory`、`shell`、`skill`、`task`、`web`、`asr`、`tts`、`voice`、`workboard` 等内建插件
  - `types/` 放插件公共协议类型

- `src/runtime/`
  - 单 Agent 的运行时实现细节层
  - `host/` 放宿主注入能力与 daemon 协议
  - `sandbox/` 放命令执行隔离与沙箱协议
  - `server/` 放 HTTP / RPC 服务端实现
  - `transport/` 放 agent client 侧 transport 协议与 RPC client
  - 模型实例解析不在 `agent` 包内完成，而由宿主先创建 `LanguageModel`，再通过 `new Agent({ model })` 或 `session.set({ model })` 注入

- `src/types/`
  - 跨模块、跨包共享协议类型
  - `common/` 放 JSON、模板等无领域依赖的基础类型
  - `config/` 放 `downcity.json`、LLM、execution binding、plugin 配置、start options 等配置契约
  - `runtime/` 放 auth、daemon、host、http、platform、rpc 等运行时与控制面共享协议
  - 领域内部类型仍保留在对应领域目录，例如 `plugin/types/`、`executor/types/`

- `src/utils/`
  - 包内通用工具、日志、CLI 输出与存储辅助

## 模块核心与依赖方向

`@downcity/agent` 的核心是一条单 Agent 执行链：

```text
入口协议 -> AgentCore -> AgentContext -> Session SDK / Executor / Plugin -> Runtime 子系统 -> History / Reply
```

其中：

- `sdk` 是用户 API 面
- `core` 是实例级装配中心
- `session SDK / executor / plugin` 是三大核心分层
- `runtime` 是 server / transport / sandbox / host 这类实现细节的统一容器
- `types / utils` 提供横向公共支撑
