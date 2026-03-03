# main/service

## 模块定位

`main/service/` 是进程编排与 services 之间的桥接层。  
它负责三件事：

1. 进程侧请求上下文（`RequestContext`）的最小透传
2. main 对 services 的直接能力调用与聚合
3. service `actions` 的统一注册与调度（CLI + HTTP）

## Service Prompt 注册约定

每个 `services/<name>/ServiceEntry.ts` 都可以声明 `systemPromptProviders` 字段。  
该字段返回当前 service 需要注册的 `SystemPromptProvider[]`。

进程层在 `RuntimeState` 中统一遍历 services 并注册，
避免在 `main` 侧硬编码某个具体 service 的 provider 细节。

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
- `core` 侧只消费稳定抽象（contextId + messages），不依赖 chat 平台字段
