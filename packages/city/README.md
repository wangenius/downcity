# @downcity/city

`@downcity/city` 是 Downcity 的平台层与多 Agent 宿主管理包。

它负责 CLI、控制面、city runtime 进程管理、全局配置存储，以及多个 agent 的注册与调度。  
它依赖 `@downcity/agent` 提供单 Agent runtime、service、plugin、control API、sandbox 与执行能力，但不重复实现这些内核。

## 包定位

- 面向平台层和宿主管理层。
- 管理多个 Agent 项目与后台进程。
- 提供控制面 gateway / control plane。
- 提供全局模型池、模型实例创建、全局环境变量、全局 chat channel account 存储。

## 与其他包的边界

- `@downcity/city`
  - 多 Agent 管理。
  - 平台 CLI。
  - 控制面 gateway / control plane。
  - 全局模型池与 city 宿主侧模型工厂。
  - city 级全局 store。

- `@downcity/agent`
  - 单 Agent runtime。
  - 单 Agent control API。
  - service / plugin / sandbox / tool loop / session 执行。

- `@downcity/ui`
  - React UI 组件与前端展示层。

## 根目录结构

```text
packages/city
├── bin/                # 编译输出目录，CLI 实际执行入口
├── public/             # 控制面前端静态资源
├── scripts/            # 构建和发布辅助脚本
├── src/                # 源码目录
├── package.json        # 包信息、CLI bin、脚本
└── tsconfig.json       # TypeScript 配置
```

## 源码结构树

```text
src
├── cli/
│   ├── agent/
│   ├── control-plane/
│   ├── model/
│   │   └── preset/
│   ├── service/
│   ├── shared/
│   └── Index.ts
├── config/
├── control/
│   ├── instant/
│   └── gateway/
├── http/
│   └── auth/
├── model/
│   └── runtime/
├── platform/
│   └── store/
├── process/
│   ├── daemon/
│   ├── registry/
│   └── rpc/
├── types/
│   ├── chat/
│   ├── contact/
│   └── task/
└── utils/
    └── cli/
```

## 目录职责

- `src/cli/`
  - CLI 命令实现与装配。
  - 已按子域拆分，避免扁平堆积。

- `src/cli/agent/`
  - `city agent ...` 命令。
  - 包括 agent create、start、stop、restart、status、chat、history、交互式 manager。

- `src/cli/control-plane/`
  - `city` 顶层 runtime 命令与 `city console ...` 命令。
  - 这层语义是 control plane / gateway 宿主管理，而不是单 Agent API。

- `src/cli/model/`
  - `city model ...` 命令。
  - 面向 city 全局模型池的 CLI 管理。

- `src/cli/model/preset/`
  - city 侧模型预设目录。
  - 只保留命令交互需要的预设定义，不再复制全局 store 实现。

- `src/cli/service/`
  - `city service ...` 与服务 action 命令桥接。
  - 负责把 CLI 命令转发到单 Agent runtime。

- `src/cli/shared/`
  - 多个 CLI 子域共用的基础能力。
  - 包括 reporter、错误类型、env、token、plugin、chat manager、命令参数辅助等。

- `src/config/`
  - city 自己的静态配置结构。
  - 包括路径规则、schema 常量。

- `src/control/`
  - 平台控制面 HTTP gateway。
  - 负责聚合多 Agent 视图、控制动作、前端资源、模型池与 channel account API。
  - 这是 gateway / control plane，不是单 Agent control API。

- `src/control/instant/`
  - control plane 下的即时执行子域。
  - 放置 instant-run 路由、临时 session service 和即时 system composer。

- `src/control/gateway/`
  - gateway 的读写辅助模块。
  - 包括 agent catalog、agent actions、proxy、frontend assets 等。

## 命名说明

- `city/cli/control-plane`
  - 这里承载 city gateway / control plane 的命令面与进程管理面。
  - CLI 命令对用户仍保留 `city console`，但源码结构已经按 control plane 语义命名。

- `city/control`
  - 这里承载的是多 agent 聚合控制面，不是单 agent control API。

- `@downcity/agent` 内部的 `server/http/control`
  - 这里承载的是 single-agent control API。
  - 当前统一路径是 `/api/control/*`。

- `src/http/auth/`
  - city 控制面自己的鉴权体系。
  - 包括 token、middleware、route policy、store。

- `src/model/runtime/`
  - city 宿主侧 `LanguageModel` 工厂。
  - 负责把 `downcity.json.execution.modelId` 解析成 provider/model 配置，再创建可注入 Agent session 的模型实例。
  - `@downcity/agent` 只消费 `LanguageModel`，不再负责模型池解析。

- `src/platform/store/`
  - city 平台持久化存储入口。
  - 承载 provider、model、环境变量、channel account 等宿主级数据。

- `src/process/`
  - city runtime 进程侧能力。
  - 统一承接 daemon、registry、local rpc，不再散落在顶层目录。

- `src/process/daemon/`
  - Agent daemon 的 pid/log/meta/启停管理。
  - 负责后台拉起 agent 前台进程。

- `src/process/registry/`
  - city runtime 与多 Agent registry 状态。
  - 记录哪些 agent 已登记、哪些 daemon 正在运行、Console/city pid 路径等。

- `src/process/rpc/`
  - city 侧 local RPC 客户端辅助。
  - 用于本机调用 Agent 暴露的 IPC 接口。

- `src/types/`
  - 当前仅保留尚未进一步归位的领域类型。
  - 目前主要是 `chat / contact / task` 三组。
  - CLI、store、city 自己的高频类型已经贴回对应模块邻近位置。

- `src/utils/`
  - 平台层通用工具。

- `src/utils/cli/`
  - CLI 输出、spinner 等命令行体验辅助。

## 关键调用关系

### 1. CLI 主入口

```text
src/cli/Index.ts
  -> control-plane/
  -> agent/
  -> model/
  -> service/
  -> shared/
```

### 2. 启动 city runtime 与 Console

```text
city start
  -> src/cli/control-plane/ControlPlaneCommand.ts
  -> src/cli/control-plane/ControlPlaneProcess.ts
  -> src/process/registry/*
  -> src/control/ControlGateway.ts
```

### 3. 启动 Agent daemon

```text
city agent start
  -> src/cli/agent/Start.ts
  -> src/process/daemon/Manager.ts
  -> detached child process
  -> @downcity/agent runtime
```

### 4. 控制面读写 Agent

```text
browser / UI
  -> src/control/ControlGateway.ts
  -> src/control/gateway/*
  -> src/process/registry/*
  -> 转发到单 Agent HTTP / RPC
```

### 5. 全局模型池

```text
city model ...
  -> src/cli/model/*
  -> src/platform/store/*
  -> src/model/runtime/CreateRuntimeModel.ts
  -> src/cli/model/preset/*
```

## 当前最重要的入口文件

- `src/cli/Index.ts`
  - CLI 主入口。

- `src/cli/control-plane/ControlPlaneCommand.ts`
  - 顶层 city / control plane 命令装配。

- `src/cli/shared/IndexAgentCommand.ts`
  - `city agent` 命令树装配。

- `src/control/ControlGateway.ts`
  - 平台控制面 gateway 主入口。

- `src/process/daemon/Manager.ts`
  - agent daemon 生命周期管理核心。

- `src/process/registry/CityRegistry.ts`
  - 多 Agent registry 核心。

- `src/model/runtime/CreateRuntimeModel.ts`
  - city 宿主侧模型工厂，负责把项目 `execution.modelId` 转成 session 可用的 `LanguageModel`。

## 维护约定

- 不要把单 Agent 执行逻辑重新实现到这个包里。
- sandbox、tool loop、session 执行、service 内核统一来自 `@downcity/agent`。
- 模型池、provider store 与模型创建逻辑留在 city 宿主层，不下沉回 `@downcity/agent`。
- `control/` 是平台 gateway / control plane。
- 单 Agent 的 HTTP control API 语义应该留在 `@downcity/agent`。
- `process/` 统一放 city 的进程管理、registry、RPC，不要再散落回顶层。
- `config/` 只放静态配置/schema/路径，不混入运行时 store 逻辑。
- CLI 类型、store 类型、city 自有小类型优先就近放在对应模块旁边。
