# main/service

## 模块定位

`main/service/` 是进程编排与 services 之间的桥接层。  
它负责三件事：

1. main 对 services 的直接能力调用与聚合
2. service `actions` 的统一注册与调度（HTTP）
3. service runtime 生命周期（start/stop/restart/status）调度

请求上下文（`RequestContext`）已迁到 `main/runtime/RequestContext.ts`。
CLI action 注册入口在 `main/service/ServiceCommand.ts`。

## Service Prompt 注册约定

每个 `services/<name>/ServiceEntry.ts` 都可以声明 `system` 字段。  
该字段签名为 `system(context) => string`，直接返回 system 文本。

运行时在每次请求前动态遍历 services 并收集 system，
避免在 `main` 侧硬编码某个具体 service 的 system 细节。

另外，`main/service/PROMPT.txt` 作为全局 service system 提示词，
由 runtime 在收集 service system 时优先注入，再拼接各 service 的 `system(context)` 结果。
建议把“所有 service 共用的规则”放在该文件中，把“单个 service 细节规则”放在 `services/<name>/PROMPT.txt`。

## Service Action 约定

`Service` 使用 `actions` 对象声明能力：

- `command`：CLI 参数定义与 `mapInput`
- `api`：HTTP method/path 与 `mapInput`
- `execute`：统一执行入口

默认 HTTP 路由规则为：`/service/<service>/<action>`（可在 action.api.path 覆盖）。

## 请求上下文约定

`ContextRequestContext` 仅保留 `contextId`。  
不再在该上下文中承载 chat 平台字段（如 `channel/targetId/messageId/threadId`）。

设计目的（中文）：

- 让进程侧请求上下文保持最小、稳定、跨服务通用
- chat 适配细节留在 `services/chat` 侧处理（chatKey + chat meta）
- 降低跨模块耦合，避免 `main` 层被平台字段污染

## ChatQueueWorker 所属边界

`ChatQueueWorker` 已下沉到 `services/chat/runtime/ChatQueueWorker.ts`。  
`main/service` 不再承载 chat 平台执行细节（如 channel/action）。

设计目的（中文）：

- 把 chat 队列消费逻辑收口在 `services/chat`
- 避免 `main` 层出现 channel/platform 业务字段
- 让 `main/service` 仅保留通用桥接职责

## Shell 环境变量透传

当前 shell 子进程环境仅注入：

- `SMA_CTX_CONTEXT_ID`
- `SMA_CTX_REQUEST_ID`

其余 chat 相关上下文变量不再由 `ShellHelpers` 注入。

## 边界约束

- `main/service` 只做编排与桥接，不承载平台业务规则
- 平台路由、chat meta、发送参数补全等逻辑应放在 `services/chat`
- runtime 只消费稳定抽象（contextId + messages），不依赖 chat 平台字段
