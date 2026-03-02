# main/service

## 模块定位

`main/service/` 是进程编排与 services 之间的桥接层。  
它负责三件事：

1. 进程侧请求上下文（`RequestContext`）的最小透传
2. chat 队列消费与 Agent 驱动（`ChatQueueWorker`）
3. process bindings（`ServiceProcessBindings`）与 services 能力对接

## Service Prompt 注册约定

每个 `services/<name>/ServiceEntry.ts` 都可以声明 `systemPromptProviders` 字段。  
该字段返回当前 service 需要注册的 `SystemPromptProvider[]`。

进程层在 `ProcessBindings.registerSystemPromptProviders` 中统一遍历 services 并注册，
避免在 `main` 侧硬编码某个具体 service 的 provider 细节。

## 请求上下文约定

`ContextRequestContext` 仅保留 `contextId`。  
不再在该上下文中承载 chat 平台字段（如 `channel/targetId/messageId/threadId`）。

设计目的（中文）：

- 让进程侧请求上下文保持最小、稳定、跨服务通用
- chat 适配细节留在 `services/chat` 侧处理（chatKey + chat meta）
- 降低跨模块耦合，避免 `main` 层被平台字段污染

## ChatQueueWorker 执行语义

`ChatQueueWorker` 负责消费 `services/chat/runtime/ChatQueue` 的 lane 队列，并串联：

1. 入站消息写入 `ContextStore`
2. 获取（或初始化）`ContextAgent`
3. 在 `withContextRequestContext({ contextId })` 下执行 `agent.run`
4. 回写 assistant 消息到 `ContextStore`

补充机制（中文）：

- 保留 step 边界消息合并（同 lane 新消息并入当前 run）
- 保留 Telegram/Feishu/QQ 的 `typing` 心跳（通过 `sendChatAction` best-effort 发送）

## Shell 环境变量透传

当前 shell 子进程环境仅注入：

- `SMA_CTX_CONTEXT_ID`
- `SMA_CTX_REQUEST_ID`

其余 chat 相关上下文变量不再由 `ShellHelpers` 注入。

## 边界约束

- `main/service` 只做编排与桥接，不承载平台业务规则
- 平台路由、chat meta、发送参数补全等逻辑应放在 `services/chat`
- `core` 侧只消费稳定抽象（contextId + messages），不依赖 chat 平台字段
