# @downcity/agent

`@downcity/agent` 是 Downcity 的单 Agent 运行时包。

它负责把一个 agent 项目目录装配成可执行运行时，包括 session、service、plugin、HTTP/RPC、sandbox、SDK 与项目级宿主能力。`@downcity/city` 负责多 Agent 管理、控制面网关、console daemon 与平台级存储；单 Agent 执行内核放在这个包里。

## 包定位

- 面向单个 Agent 项目的执行面。
- 对外通过 `@downcity/agent` 根入口暴露公共 API。
- 负责 session、service、plugin、sandbox、HTTP/RPC server、SDK 本地 Agent。
- 不负责多 Agent registry、control plane daemon、console UI 聚合和平台级编排。

## 与其他包的边界

- `@downcity/agent`
  - 单 Agent runtime。
  - 单 Agent HTTP/RPC server。
  - session 执行、service 框架、plugin 框架、sandbox。
  - 本地 SDK facade。
- `@downcity/city`
  - 多 Agent registry。
  - control plane / gateway。
  - 平台 CLI、模型池、全局 env、channel account store。
  - agent daemon 进程管理。
- `@downcity/ui`
  - React UI 组件与展示层。

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
src
├── index.ts
├── config/
├── host/
│   ├── daemon/
│   └── runtime/
├── model/
├── plugin/
│   ├── builtins/
│   ├── core/
│   └── types/
├── project/
│   └── types/
├── runtime/
├── sandbox/
│   └── types/
├── sdk/
├── server/
│   ├── http/
│   └── rpc/
├── service/
│   ├── builtins/
│   ├── core/
│   ├── schedule/
│   └── types/
├── session/
│   ├── composer/
│   ├── executors/
│   ├── ids/
│   ├── messages/
│   ├── tools/
│   └── types/
├── transport/
│   └── rpc/
├── types/
│   ├── auth/
│   ├── common/
│   ├── config/
│   ├── daemon/
│   ├── host/
│   ├── http/
│   ├── platform/
│   └── rpc/
└── utils/
    ├── cli/
    ├── logger/
    └── storage/
```

## 目录职责

- `src/index.ts`
  - 包的唯一公开入口。
  - `city` 和外部调用方应从这里导入公共能力，避免依赖内部子路径。

- `src/runtime/`
  - 单 Agent runtime 装配层。
  - `AgentRuntime.ts` 负责初始化 config、model、session factory、services、plugins、hot reload。
  - `AgentContext.ts` 负责从 `AgentRuntime` 派生统一能力面。

- `src/project/`
  - 项目初始化与 execution binding。
  - 负责 agent 项目骨架、默认文件、模型绑定与初始化结果类型。

- `src/config/`
  - 项目配置与项目级路径解析。
  - 负责 `downcity.json`、项目 env、`.downcity/*` 路径规则。

- `src/host/`
  - Agent 运行时与宿主环境之间的端口层。
  - `runtime/` 只保留注入到 `AgentRuntime` 的宿主端口、plugin 配置能力与 plugin runtime resolver。
  - `daemon/` 只保留 agent 侧 daemon 协议、项目准备、HTTP client 与项目级 daemon meta 路径。
  - daemon 进程启停、pid 清理、registry 同步等平台级管理职责属于 `@downcity/city`。

- `src/types/`
  - 跨模块、跨包共享协议类型。
  - `common/` 放 JSON、模板等基础类型。
  - `config/` 放 `downcity.json`、execution binding、LLM、start options 等配置类型。
  - `host/`、`platform/`、`daemon/`、`rpc/`、`auth/`、`http/` 放 city/agent 共享控制面协议。
  - 领域内部类型仍保留在对应领域目录，例如 `service/types/`、`plugin/types/`、`session/types/`。

- `src/sdk/`
  - 本地 SDK facade。
  - 包括 `Agent`、`RemoteAgent`、`SdkSession`、SDK HTTP/RPC wrapper 与 session metadata。

- `src/server/`
  - 单 Agent server 层。
  - `http/` 是 HTTP server 与路由，包含 `control / execute / services / plugins / health / static`。
  - `rpc/` 是本机 local RPC server。

- `src/transport/`
  - agent 调用端 transport 协议。
  - `rpc/` 放 local RPC client、endpoint path、transport 选择器与协议类型。

- `src/model/`
  - 模型创建与模型运行辅助。

- `src/plugin/`
  - 插件框架与内建插件。
  - `core/` 负责注册、启用态、hook 调度、本地 action。
  - `builtins/` 放 `auth`、`skill`、`web`、`asr`、`tts`、`voice`、`workboard` 等内建插件。
  - `types/` 放插件公共协议类型。

- `src/service/`
  - 单 Agent service 域。
  - `core/` 负责 service class 注册、状态控制、action 调度、HTTP route 注册。
  - `builtins/` 放 `chat`、`contact`、`task`、`memory`、`shell` 等内建 service。
  - `schedule/` 负责持久化 service action 调度。
  - `types/` 放 service 公共协议类型。

- `src/session/`
  - 会话执行内核。
  - `Session.ts` 是单 session 实例外壳。
  - `executors/local/LocalSessionExecutor.ts` 装配执行器。
  - `executors/local/LocalSessionCore.ts` 执行模型/tool loop。
  - `executors/local/SessionToolLoopRunner.ts` 承担 tool loop 的逐轮调度。
  - `executors/local/SessionModelMessageState.ts` 维护 session/model 双消息基线。
  - `executors/local/SessionUiStreamCollector.ts` 收敛 UI stream 最终 assistant 消息。
  - `executors/local/SessionExecutionError.ts` 归一化 stream/provider 错误。
  - `composer/` 负责 history、system、execution、compaction 的组合。
  - `messages/` 负责消息编码、附件映射与 step event 映射。
  - `tools/` 放 session 可用工具定义。

- `src/sandbox/`
  - 命令执行沙箱。
  - shell/task 等执行最终通过这里进入受限环境。

- `src/utils/`
  - 包内通用工具、日志、CLI 输出、基础 JSON/Template 类型。

## 当前运行主链

### Agent 启动

```text
city agent start
  -> @downcity/city cli/agent/Run.ts
  -> initAgentRuntime()
  -> ensureRuntimeProjectReady()
  -> loadDowncityConfig() / load env / load static prompts
  -> createModel()
  -> create session factory
  -> createRegisteredServiceInstances()
  -> initializePluginManager()
  -> startServer() / startLocalRpcServer()
  -> startAllServices() / startServiceScheduleRuntime()
```

关键入口：

- `src/runtime/AgentRuntime.ts`
- `src/runtime/AgentContext.ts`
- `src/server/http/Server.ts`
- `src/server/rpc/Server.ts`

### Session 执行

```text
外部输入
  -> HTTP / RPC / service / SDK
  -> AgentRuntime.getSession(sessionId)
  -> Session.run()
  -> LocalSessionExecutor
  -> LocalSessionCore
  -> model / tools / system / history / compaction
  -> assistant message 持久化与回调
```

关键入口：

- `src/session/Session.ts`
- `src/session/executors/local/LocalSessionExecutor.ts`
- `src/session/executors/local/LocalSessionCore.ts`
- `src/session/executors/local/SessionToolLoopRunner.ts`

### Service 调用

```text
AgentContext.invoke
  -> service/core/ServiceActionRunner.ts
  -> service/core/ServiceStateController.ts
  -> service/builtins/* 具体 action
```

### Plugin 调用

```text
AgentContext.plugins
  -> plugin/core/PluginManager.ts
  -> plugin/core/PluginRegistry.ts
  -> plugin/builtins/* 具体 plugin
```

### 沙箱执行

```text
shell tool / shell service / task service
  -> sandbox/SandboxConfigResolver.ts
  -> sandbox/SandboxRunner.ts
  -> sandbox/MacOsSeatbeltSandbox.ts
```

## 公开导出约定

- 包外只从 `@downcity/agent` 根入口导入。
- `@downcity/agent/*` 子路径不是公共 API。
- `src/index.ts` 必须使用显式导出清单，不使用 `export *` 扩大公共面。
- 根入口只暴露 SDK、插件/服务作者 API、city 运行集成 API 与跨包协议类型。
- HTTP router、sandbox runner、内部 service runner 等实现细节不从根入口导出。
- 如果 `city` 需要新的 agent 能力，先补到 `src/index.ts`，再由 `city` 消费。
- `packages/city/scripts/lint-import-boundaries.mjs` 会检查 city 不直接依赖 agent 内部子路径。

## 后续整理方向

当前 `packages/agent/src` 已按单 Agent 执行内核拆分，根入口也已改成显式公共 API 清单。后续推荐继续把跨包共享的基础类型集中到 `types/`：

```text
src
├── runtime/          # AgentRuntime / AgentContext / runtime state
├── project/          # 初始化、execution binding、项目准备
├── server/           # http / rpc / auth / routes
├── transport/        # agent client transport 协议
├── sdk/              # SDK facade
├── session/
├── service/
├── plugin/
├── sandbox/
├── model/
├── config/
├── types/            # 跨模块共享类型
└── utils/
```

迁移优先级：

1. 将跨模块共享类型继续集中到 `src/types/`，模块私有类型保留在本模块 `types/` 下。
2. 大模块超过 800-1000 行时继续按职责拆分。

## 维护约定

- 不要把多 Agent 管理逻辑写进这个包。
- 不要在 `city` 中复制 agent 的 session/service/plugin/sandbox 执行内核。
- `service/core` 和 `service/builtins` 必须保持边界清晰。
- `plugin/core` 和 `plugin/builtins` 必须保持边界清晰。
- `bin/` 是构建产物，不直接修改。
