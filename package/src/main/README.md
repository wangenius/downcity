# main

## 模块定位

`main/` 是运行时主模块，负责 CLI / daemon / server 启动、运行时状态装配、会话执行编排、prompt 组装与模型接入。

> 架构设计文档（微内核 + 模块化 + 解耦）：`./ARCHITECTURE.md`

## 实现概览

1. `commands/`
   - CLI 入口与子命令实现：`run/start/stop/restart/init/services/alias/config`。
   - `Index.ts` 负责命令注册与默认命令回退（未识别一级命令时转发到 `run`）。
2. `agent/`
   - `Agent.ts` 是单次会话执行微内核，只负责 `run` 主链路。
   - `components/*Component.ts` 定义执行组件抽象：`Persistor / Compactor / Orchestrator / Systemer`。
3. `runtime/`
   - `state/RuntimeState.ts` 管理进程级运行状态与主装配。
   - `state/ProjectRuntimeSetup.ts` 收敛启动前项目检查与 `.ship` 目录准备。
   - `context/ContextManager.ts` 管理 `contextId -> Agent` 生命周期与统一调用入口。
   - `context/RequestContext.ts` 与 `context/ContextId.ts` 提供请求上下文与 context 标识能力。
   - `context/components/*` 提供默认会话组件实现：`FilePersistor / SummaryCompactor / RuntimeOrchestrator`。
   - `env/Config.ts` 收敛 `.env` + `ship.json` 读取与环境变量占位替换。
   - `env/Paths.ts` 收敛 `.ship/*` 目录与关键文件路径规则。
   - `transport/daemon/*` 收敛 daemon 通信与进程管理。
   - `transport/server/index.ts 与 routes/*.ts（TUI 路由位于 `ui/tui/Router.ts`）` 承载 HTTP API、静态资源服务与 service 路由挂载。
4. `prompts/`
   - `PromptRuntime.ts` 收敛静态 prompt 加载与热重载。
   - `System.ts` 是 system 能力统一导出入口。
   - `system/` 收敛 system 域实现：system 资产、system message 组装、system 组件适配。
   - `common/` 收敛公共 prompt 能力：渲染器与 init prompt 资产加载。
   - `variables/` 收敛模板变量构建与替换能力。
5. `model/`
   - `CreateModel.ts` 负责根据配置创建模型实例。
   - `ModelManager.ts` 负责模型预设与 provider 映射策略。
   - `ModelCommand.ts` 负责命令层模型选择与默认值解析。
6. `service/`
   - `Manager.ts` / `ServiceManager.ts` 提供 service 注册契约与运行态调度入口。
   - service 采用 `actions` 对象模型，由主运行时自动注册 CLI 与 HTTP 路由。
   - 详细约束见 `service/README.md`。
7. `tools/shell/`
   - 提供会话式 shell 工具：`exec_command`、`write_stdin`、`close_shell`。
8. `types/`
   - 放置主运行时协议类型、配置类型与上下文类型。
9. `../utils/storage/index.ts`
   - 提供跨模块复用的轻量存储辅助能力，不再归属 `runtime/`。

## 关键文件

- `commands/Index.ts`
- `commands/Run.ts`
- `commands/Start.ts`
- `runtime/state/RuntimeState.ts`
- `runtime/state/ProjectRuntimeSetup.ts`
- `runtime/context/ContextManager.ts`
- `runtime/transport/server/index.ts 与 routes/*.ts（TUI 路由位于 `ui/tui/Router.ts`）`
- `runtime/transport/daemon/Client.ts`
- `runtime/transport/daemon/Manager.ts`
- `agent/Agent.ts`
- `prompts/System.ts`
- `prompts/PromptRuntime.ts`
- `model/ModelManager.ts`
- `model/ModelCommand.ts`
- `service/Manager.ts`
- `service/ServiceManager.ts`
- `service/ServiceCommand.ts`
- `tools/shell/Tool.ts`
- `../utils/storage/index.ts`

## 启动链路（简化）

1. `commands/Index.ts` 解析 CLI。
2. `run` 模式：初始化 `RuntimeState`，再启动 Hono server 与 services。
3. `start` 模式：通过 `runtime/transport/daemon/Manager.ts` 以 detached 方式后台拉起 `run` 子进程。
4. `stop/restart` 模式：依据 `.ship/debug` 中的 pid/meta 文件管理 daemon 生命周期。

## 边界约束

- `main/` 负责组装与编排，不承载具体业务策略。
- `Agent` 只保留执行主链路，策略由组件提供。
- 环境、上下文、传输、prompt、模型按功能域拆分，避免横向混放。
- 业务能力继续下沉到 `services/`。
