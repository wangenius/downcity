# @downcity/agent

`@downcity/agent` 是 Downcity 的单 Agent 运行时包。

它负责把“一个项目目录”装配成可以执行任务、管理会话、运行服务、暴露 HTTP/RPC 接口、加载插件和使用沙箱的 Agent。  
`@downcity/city` 负责管理多个 Agent 和控制面，真正的单 Agent 执行内核在这个包里。

## 包定位

- 面向单个 Agent 项目运行时。
- 提供公开 API，供 `@downcity/city` 和外部 SDK 使用。
- 负责执行层，不负责多 Agent 管理和全局控制面。

## 与其他包的边界

- `@downcity/agent`
  - 负责单 Agent 的执行、会话、服务、插件、HTTP/RPC、沙箱。
- `@downcity/city`
  - 负责 CLI、daemon、多 Agent registry、控制面网关、全局 store。
- `@downcity/ui`
  - 负责 React UI 组件，不参与运行时执行。

## 根目录结构

```text
packages/agent
├── bin/                # 编译输出目录，对外发布的 JS / d.ts 产物
├── scripts/            # 构建辅助脚本
├── src/                # 源码目录
├── package.json        # 包信息、导出面、构建脚本
└── tsconfig.json       # TypeScript 配置
```

## 源码结构树

```text
src
├── index.ts
├── agent/
├── config/
├── daemon/
├── http/
├── model/
├── plugin/
├── plugins/
├── rpc/
├── runtime/
├── sandbox/
├── sdk/
├── service/
├── services/
├── session/
├── shared/
├── types/
```

## 目录职责

- `src/index.ts`
  - 包的公开导出入口。
  - 统一暴露 Agent runtime、HTTP/RPC、service、plugin、sandbox、SDK 能力。

- `src/agent/`
  - Agent 宿主装配层。
  - 负责初始化 runtime、构建 `AgentContext`、装配模型、session、service、plugin。
  - `project/` 子目录负责项目初始化和 execution binding。

- `src/config/`
  - 配置与路径解析。
  - 负责读取 `downcity.json`、env 快照，以及 `.downcity` 相关路径。

- `src/daemon/`
  - Agent 项目准备逻辑。
  - 负责确保项目运行前所需文件和绑定就绪。

- `src/http/`
  - 单 Agent HTTP 服务。
  - `auth/`：HTTP 认证与路由鉴权。
  - `control/`：单 Agent 控制面 API。
  - `execute/`：直接执行入口，例如 `/api/execute`。
  - `health/`：健康检查。
  - `plugins/`：插件 HTTP 能力入口。
  - `services/`：服务动作 HTTP 入口。
  - `static/`：静态资源路由。

- `src/model/`
  - 模型实例创建与模型管理辅助。
  - 负责把配置绑定成可执行的模型对象。

- `src/plugin/`
  - 插件管理层。
  - 负责插件注册、启用态、Hook、HTTP 路由、命令桥接。

- `src/plugins/`
  - 内建插件实现。
  - 当前包括 `auth`、`skill`、`web`、`asr`、`tts`、`voice`、`workboard` 等。

- `src/rpc/`
  - 本地 RPC 服务与客户端。
  - 用于本机受信任进程访问 Agent runtime，不走 HTTP。

- `src/runtime/`
  - Agent 宿主辅助运行时能力。
  - 例如路径运行时、插件配置运行时、宿主级能力封装。

- `src/sandbox/`
  - 命令执行沙箱实现。
  - 当前负责 shell/task 命令进入受限执行环境。
  - 这是唯一保留真实 sandbox 实现的包层。

- `src/sdk/`
  - 对外 SDK。
  - 包括本地 `Agent`、远程 `RemoteAgent`、Session SDK 等能力。

- `src/service/`
  - service 管理层。
  - 负责 service 注册、生命周期控制、命令调度、调度器装配。

- `src/services/`
  - 具体业务 service 实现。
  - `chat/`：聊天渠道、队列、回复分发。
  - `contact/`：联系、批准、共享相关服务。
  - `memory/`：记忆写入、检索、索引。
  - `shell/`：shell 执行服务。
  - `task/`：任务、cron、执行轮次与产物。

- `src/session/`
  - 会话执行内核。
  - 负责消息历史、system prompt、tool loop、compaction、执行器。
  - 是 Agent 执行路径的核心。

- `src/shared/`
  - 跨层共享常量、类型、工具。
  - `constants/`：共享常量。
  - `types/`：共享协议类型。
  - `utils/`：共享工具函数和基础设施。

- `src/types/`
  - 内部运行时类型定义。
  - 按领域分到 `agent`、`chat`、`sandbox`、`session`、`task`、`sdk` 等目录。

## 关键调用关系

### 1. Agent 启动

```text
initAgentRuntime()
  -> 读取 config / env
  -> 创建 model
  -> 创建 session/system/compaction 组件
  -> 创建 services
  -> 初始化 plugins
  -> 暴露 AgentContext
```

关键入口：

- `src/agent/AgentRuntime.ts`
- `src/agent/AgentContext.ts`

### 2. HTTP 执行

```text
HTTP Request
  -> src/http/Server.ts
  -> src/http/execute or src/http/control
  -> Session
  -> LocalSessionExecutor / LocalSessionCore
  -> tools / services / plugins
```

### 3. Service 调用

```text
AgentContext.invoke
  -> src/service/Manager.ts
  -> src/service/ServiceActionRunner.ts
  -> src/services/* 具体实现
```

### 4. Shell / Task 命令执行

```text
services/shell or services/task
  -> src/sandbox/SandboxRunner.ts
  -> src/sandbox/MacOsSeatbeltSandbox.ts
```

## 当前最重要的入口文件

- `src/index.ts`
  - 对外 API 汇总入口。
- `src/agent/AgentRuntime.ts`
  - 单 Agent runtime 主装配入口。
- `src/http/Server.ts`
  - HTTP 服务装配入口。
- `src/session/Session.ts`
  - 单 Session 外层实例。
- `src/session/executors/local/LocalSessionCore.ts`
  - 本地执行内核。
- `src/service/Manager.ts`
  - service 管理门面。

## 维护约定

- 不要把多 Agent 管理逻辑写进这个包。
- 不要在 `city` 里复制这里的执行期实现，例如 sandbox。
- 新的执行能力优先放在 `services/`、`plugin/` 或 `session/` 对应层，而不是塞进 `index.ts` 附近。
- `bin/` 是构建产物，不直接手改。
