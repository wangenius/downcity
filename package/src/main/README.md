# main

## 模块定位

`main/` 是进程编排层，负责 CLI/daemon/server 启动、运行时初始化、配置与路径管理、以及服务依赖注入。  
它把 `core/` 的内核能力组装成可启动的应用进程。

## 实现概览

1. `commands/`
   - CLI 入口与子命令实现：`run/start/stop/restart/init/services/alias`。
   - `Index.ts` 负责命令注册与默认命令回退（未识别一级命令时转发到 `run`）。
2. `runtime/`
   - `RuntimeState.ts` 管理进程级运行状态（rootPath/config/logger/contextManager）。
   - `AgentServer.ts` 承载 HTTP API、静态资源服务与 service 路由挂载。
   - `Client.ts` 实现 CLI -> daemon API 的统一调用与 endpoint 解析。
   - `Manager.ts` 负责后台 daemon 进程 PID/日志/启停管理。
   - `Config.ts` 读取 `.env` + `ship.json` 并解析 `${ENV}` 占位符。
   - `Paths.ts` 提供 `.ship/*` 路径约定，作为全项目统一事实来源。
4. `service/`
   - `Registry.ts` / `ServiceRegistry.ts` 提供 service 注册契约与运行态调度入口。
   - service 采用 `actions` 对象模型：由 `Registry.ts` 自动注册 CLI 与 HTTP 路由（默认 `/service/<service>/<action>`）。
   - `types/` 提供 service 依赖注入端口类型定义（`ServiceRuntimeDependencies` 等）。
   - `RequestContext.ts` 仅透传最小请求上下文（`contextId`）。
   - `RuntimeState.ts` 直接聚合 services 能力并注入运行时桥接。
   - chat 队列执行器已下沉到 `services/chat/runtime/ChatQueueWorker.ts`。
   - 详细约束见 `service/README.md`（含请求上下文与 shell env 透传约定）。
5. `types/constants/utils/ui`
   - 放置进程层协议类型、常量、CLI 输出与 Web UI 辅助实现。

## 关键文件

- `commands/Index.ts`
- `commands/Run.ts`
- `commands/Start.ts`
- `runtime/RuntimeState.ts`
- `runtime/AgentServer.ts`
- `runtime/Client.ts`
- `runtime/Manager.ts`
- `project/Config.ts`
- `service/Registry.ts`
- `service/ServiceRegistry.ts`
- `service/RequestContext.ts`
- `service/README.md`

## 启动链路（简化）

1. `commands/Index.ts` 解析 CLI。
2. `run` 模式：`initRuntimeState` -> 启动 `AgentServer` -> 启动 service runtimes。
3. `start` 模式：通过 `runtime/Manager.ts` 以 detached 方式后台拉起 `run` 子进程。
4. `stop/restart` 模式：依据 `.ship/debug` 中的 pid/meta 文件管理 daemon 生命周期。

## 边界约束

- `main` 负责“组装与编排”，不沉淀具体业务策略。
- 业务能力应下沉到 `services/`，内核机制应留在 `core/`。
