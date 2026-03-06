# main

## 模块定位

`main/` 是运行时主模块，负责 CLI/daemon/server 启动、运行时初始化、配置与路径管理、以及服务依赖注入。  
Agent 执行、上下文持久化与模型构建也统一收敛在该目录。

> 架构设计文档（微内核 + 模块化 + 解耦）：`./ARCHITECTURE.md`

## 实现概览

1. `commands/`
   - CLI 入口与子命令实现：`run/start/stop/restart/init/services/alias`。
   - `Index.ts` 负责命令注册与默认命令回退（未识别一级命令时转发到 `run`）。
2. `runtime/`
   - `RuntimeState.ts` 管理进程级运行状态（rootPath/config/logger/contextManager）。
   - `ContextManager.ts` 管理会话 agent/persistor 生命周期与运行上下文组装。
   - `AgentServer.ts` 承载 HTTP API、静态资源服务与 service 路由挂载。
   - `Client.ts` 实现 CLI -> daemon API 的统一调用与 endpoint 解析。
   - `Manager.ts` 负责后台 daemon 进程 PID/日志/启停管理。
   - `Config.ts` 读取 `.env` + `ship.json` 并解析 `${ENV}` 占位符。
   - `Paths.ts` 提供 `.ship/*` 路径约定，作为全项目统一事实来源。
3. `prompts/`
   - `System.ts` 是 system 能力门面层（统一导出入口）。
   - `system/` 收敛 system 域实现：system 资产、message 组装、resolver、组件适配层。
   - `common/` 收敛公共 prompt 能力：类型、地理上下文、渲染器、init 模板资产。
   - `variables/` 收敛模板变量替换能力（独立模块）。
4. `service/`
   - `Manager.ts` / `ServiceManager.ts` 提供 service 注册契约与运行态调度入口。
   - service 采用 `actions` 对象模型：由 `Manager.ts` 自动注册 CLI 与 HTTP 路由（默认 `/service/<service>/<action>`）。
   - `types/` 提供 service 依赖注入端口类型定义（`ServiceRuntime` 等）。
   - `RequestContext.ts` 仅透传最小请求上下文（`contextId`）。
   - `RuntimeState.ts` 直接聚合 services 能力并注入运行时桥接。
   - chat 队列执行器已下沉到 `services/chat/runtime/ChatQueueWorker.ts`。
   - 详细约束见 `service/README.md`（含请求上下文与 shell env 透传约定）。
5. `agent/`
   - `Agent.ts` 提供单会话 Agent 执行器（system/tools 外部注入）。
   - `components/*Component.ts` 提供组件抽象（Persistor/Compactor/Orchestrator/Systemer）。
6. `runtime/components/compact/`
   - `SummaryCompact.ts` 提供摘要压缩算法实现（由 runtime 组件调用）。
   - `runtime/components/*.ts` 提供默认组件实现（FilePersistor/SummaryCompactor/RuntimeOrchestrator）。
7. `prompts/system/`
   - `PromptSystemer.ts` 提供 system 组件适配层。
   - `SystemDomain.ts` 收敛 system 全链路：资产加载、显式档位(profile)解析、service 收集、messages 组装。
   - `assets/` 存放 system 相关文本资产（`core.prompt.txt` / `service.prompt.txt` / `task.prompt.txt`）。
8. `prompts/common/`
   - `PromptRenderer.ts` 负责文本 prompt 到 system message 的转换。
   - `InitPrompts.ts` 提供 init 阶段 `PROFILE/SOUL/USER` 模板资产加载。
9. `prompts/variables/`
   - `VariableReplacer.ts` 负责模板变量构建与变量替换。
   - `PromptTypes.ts` 提供模板变量相关类型。
   - `GeoContext.ts` 负责地理上下文解析与缓存。
10. `llm/`
   - `CreateModel.ts` 负责根据 ship.json 构建运行时模型实例。
   - `ModelManager.ts` 负责管理 init 模型预设与 provider 映射策略。
11. `commands/ModelCommand.ts`
   - 提供命令层模型入口（模型选项列表、默认索引、init 模型解析）。
12. `tools/shell/`
   - `Tool.ts` 暴露会话式 shell 工具：`exec_command`、`write_stdin`、`close_shell`。
   - shell 工具在 main 层注册后注入到 `Agent`。
13. `types/constants/utils/ui`
   - 放置进程层协议类型、常量、CLI 输出与 Web UI 辅助实现。

## 关键文件

- `commands/Index.ts`
- `commands/Run.ts`
- `commands/Start.ts`
- `runtime/RuntimeState.ts`
- `runtime/AgentServer.ts`
- `runtime/Client.ts`
- `runtime/Manager.ts`
- `agent/Agent.ts`
- `prompts/System.ts`
- `project/Config.ts`
- `service/Manager.ts`
- `service/ServiceManager.ts`
- `service/ServiceCommand.ts`
- `runtime/RequestContext.ts`
- `service/README.md`
- `tools/shell/Tool.ts`

## 启动链路（简化）

1. `commands/Index.ts` 解析 CLI。
2. `run` 模式：`initRuntimeState` -> 启动 `AgentServer` -> 启动 service runtimes。
3. `start` 模式：通过 `runtime/Manager.ts` 以 detached 方式后台拉起 `run` 子进程。
4. `stop/restart` 模式：依据 `.ship/debug` 中的 pid/meta 文件管理 daemon 生命周期。

## 边界约束

- `main` 负责“组装与编排”，不沉淀具体业务策略。
- 业务能力应下沉到 `services/`。
