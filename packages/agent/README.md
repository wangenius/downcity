# @downcity/agent

`@downcity/agent` 是 Downcity 的单 Agent 运行时包。

它负责把一个 agent 项目目录装配成可执行运行时，包括 session、service、plugin、HTTP、RPC、sandbox 与宿主能力。  
`@downcity/city` 负责多 Agent 管理、控制面网关、console/daemon；真正的单 Agent 执行内核在这个包里。

## 包定位

- 面向单个 Agent 运行时。
- 对外暴露统一公开 API，供 `@downcity/city` 和其他调用方使用。
- 负责执行层，不负责多 Agent 编排和全局控制面。
- 包外调用统一从 `@downcity/agent` 根入口读取，不再依赖内部子路径。

## 与其他包的边界

- `@downcity/agent`
  - 单 Agent 宿主、执行、会话、服务、插件、HTTP/RPC、沙箱。
- `@downcity/city`
  - 多 Agent registry、console daemon、gateway/control plane、全局 store、用户入口 CLI。
- `@downcity/ui`
  - React UI 组件与展示层，不承载运行时执行。

## 根目录结构

```text
packages/agent
├── bin/                # 构建输出目录
├── scripts/            # 构建辅助脚本
├── src/                # 源码目录
├── package.json        # 包信息、导出面、脚本
├── README.md           # 面向使用者的包说明
└── tsconfig.json       # TypeScript 配置
```

## 源码结构树

```text
src
├── index.ts
├── agent/
├── config/
├── host/
│   ├── daemon/
│   ├── rpc/
│   ├── runtime/
│   └── sdk/
├── http/
├── model/
├── plugin/
├── plugins/
├── sandbox/
├── service/
│   ├── builtins/
│   ├── core/
│   └── schedule/
├── session/
├── shared/
└── types/
```

## 目录职责

- `src/index.ts`
  - 包的唯一公开入口。
  - 统一导出单 Agent 运行时最常用的能力，避免上层依赖内部目录树。

- `src/agent/`
  - Agent 宿主装配层。
  - 负责初始化 runtime、构建 `AgentContext`、装配 model、session、service、plugin。
  - `project/` 子目录负责项目初始化和 execution binding。

- `src/config/`
  - 配置与路径解析层。
  - 负责读取 `downcity.json`、env 快照和 `.downcity` 相关路径。

- `src/host/`
  - 单 Agent 宿主相关能力。
  - `daemon/`：项目准备、宿主接入、启动前校验。
  - `rpc/`：本地 IPC / RPC 入口与客户端。
  - `runtime/`：宿主运行时辅助能力，例如路径与 plugin runtime 装配。
  - `sdk/`：对外 SDK，包括 `Agent`、`RemoteAgent`、`Session` 等宿主访问封装。

- `src/http/`
  - 单 Agent HTTP 服务层。
  - `auth/`：认证与路由鉴权。
  - `control/`：单 Agent control API。
  - `execute/`：直接执行入口。
  - `health/`：健康检查。
  - `plugins/`：插件相关 HTTP 入口。
  - `services/`：service HTTP 路由挂载。
  - `static/`：静态资源路由。

- `src/model/`
  - 模型创建与模型管理辅助层。

- `src/plugin/`
  - 插件框架层。
  - 负责插件注册、启用态、命令桥接、HTTP 路由与生命周期。

- `src/plugins/`
  - 内建插件实现。
  - 当前包括 `auth`、`skill`、`web`、`asr`、`tts`、`voice`、`workboard` 等。

- `src/sandbox/`
  - 命令执行沙箱实现。
  - 负责 shell/task 等执行进入受限环境。
  - 这是 agent 内部真实执行沙箱，不是 city 侧控制面概念。

- `src/service/`
  - 单 Agent service 域。
  - `core/`：service 框架层，负责注册、生命周期控制、action 分发、系统提示注入。
  - `builtins/`：内建 service 实现，例如 chat、task、memory、shell、contact。
  - `schedule/`：service action 的调度与持久化。

- `src/session/`
  - 会话执行内核。
  - 负责消息历史、system prompt、tools、compaction、executor。

- `src/shared/`
  - 跨层共享常量、共享协议类型、共享工具。
  - 适合包内跨层复用的内容。
  - 这里的目录结构用于内部组织，不作为包外公开导入路径。

- `src/types/`
  - 当前只保留少量基础运行时类型。
  - 主要剩余 `session/` 与 `sandbox/` 这类仍适合集中维护的底层类型。
  - 其他领域类型应优先放回各自模块旁边，避免重新形成“大一统 types 目录”。

## 导出约定

- 唯一公开入口是 `@downcity/agent`。
- `shared/types`、`host/*`、`service/*`、`session/*`、`plugin/*` 等目录只表达源码分层，不作为公开导入地址。
- 如果 `city` 或其他包需要新能力，应先补到 `src/index.ts`，而不是直接依赖内部文件路径。

## 关键边界

- `host/`
  - 表示“单 Agent 宿主能力”。
  - 比旧的 `daemon/rpc/runtime/sdk` 平铺结构更清晰。

- `service/core/`
  - 表示 service 框架和管理层。
  - 不放具体业务 service 实现。

- `service/builtins/`
  - 表示内建单 Agent service 实现。
  - 这里的 `chat`、`task`、`memory`、`shell`、`contact` 都是业务 service。

- `http/control/`
  - 表示单 Agent control API。
  - 不等于 city 的 gateway/control plane。
  - 当前 `/api/dashboard/*` 只是历史 URL 命名，后续若改路径，也不改变这层职责边界。

- `city`
  - 不复制 agent 内部执行逻辑。
  - 应优先通过 `@downcity/agent` 根入口拿能力，而不是深入内部子路径。

## 关键调用关系

### 1. Agent 启动

```text
initAgentRuntime()
  -> 读取 config / env
  -> 创建 model
  -> 创建 session 组件
  -> 创建 service 实例
  -> 初始化 plugins
  -> 导出 AgentContext
```

关键入口：

- `src/agent/AgentRuntime.ts`
- `src/agent/AgentContext.ts`

### 2. HTTP 执行

```text
HTTP Request
  -> src/http/Server.ts
  -> src/http/execute or src/http/control
  -> Session / Executor
  -> tools / services / plugins
```

### 3. Service 调用

```text
AgentContext.invoke
  -> src/service/core/Manager.ts
  -> src/service/core/ServiceActionRunner.ts
  -> src/service/builtins/* 具体实现
```

### 4. 沙箱执行

```text
task / shell service
  -> src/sandbox/SandboxRunner.ts
  -> src/sandbox/MacOsSeatbeltSandbox.ts
```

## 当前最重要的入口文件

- `src/index.ts`
  - 包的统一公开入口。
- `src/agent/AgentRuntime.ts`
  - 单 Agent runtime 主装配入口。
- `src/http/Server.ts`
  - HTTP 服务装配入口。
- `src/session/Session.ts`
  - 单 Session 外层实例。
- `src/service/core/Manager.ts`
  - service 管理门面。
- `src/host/sdk/Agent.ts`
  - SDK 访问入口。

## 维护约定

- 不要把多 Agent 管理逻辑写进这个包。
- 不要在 `city` 中复制 agent 的执行期实现。
- 上层产品优先从 `@downcity/agent` 根入口获取能力。
- `service/core` 和 `service/builtins` 必须保持边界清晰。
- `bin/` 是构建产物，不直接修改。
