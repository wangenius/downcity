# services

## 模块定位

`services/` 是 Downcity 的主动业务层。  
每个 service 对外暴露统一的 `Service` 契约，但在运行时已经逐步迁移为 `BaseService` 子类，由 agent 在启动时创建 `per-agent service instance`。

## 当前整体模型

1. `main/service/Services.ts`
   - 维护 service 的静态注册清单。
2. `main/registries/ServiceClassRegistry.ts`
   - 负责把静态 service 定义实例化为 `BaseService` 子类。
3. `agent/AgentRuntime.ts`
   - agent 持有当前运行中的 service 实例集合。
4. `main/service/Manager.ts`
   - 统一做 service lifecycle、action 调度、CLI/API 桥接。
5. `src/types/Service.ts`
   - 作为 service 共享契约的单一事实源。

## 当前内建 service

1. `chat/`
   - 负责聊天渠道接入、session 路由、消息发送与会话查询。
   - `ChatService.ts` 是实例入口。
   - `ChatService` 只保留实例骨架，持有实例级 `channelState` 与 `queueWorker`。
   - `runtime/ChatServiceActions.ts` 负责 action 注册表装配。
   - `runtime/ChatServiceSystem.ts` 负责 system prompt。
   - `runtime/ChatChannelCore.ts` 负责渠道基础 helper。
   - `runtime/ChatChannelLifecycle.ts` 负责渠道 bot 生命周期。
   - `runtime/ChatChannelConfig.ts` 负责状态快照与配置落盘。
   - `runtime/ChatChannelActions.ts` 负责渠道类 action 执行。
   - `runtime/ChatChannelFacade.ts` 只保留门面导出。
   - `runtime/ChatActionInput.ts` 负责 CLI/API 输入映射。
   - `runtime/ChatActionExecution.ts` 负责消息类 action 执行。
   - `runtime/ChatQueueSessionBridge.ts` 负责 queue 与 session 的桥接写入协议。
   - `runtime/ChatQueueWorkerSupport.ts` 负责 worker 辅助能力。
   - `runtime/ChatQueueReplyDispatch.ts` 负责 direct/fallback 回复分发。
   - `runtime/ChatQueueWorker.ts` 负责 queue lane 调度与主执行链。
   - `channels/BaseChatChannel.ts` 负责渠道基类门面与公共编排。
   - `channels/BaseChatChannelSupport.ts` 负责 session 映射、history 与 chat meta 辅助。
   - `channels/BaseChatChannelQueue.ts` 负责 audit/exec 入队编排。
   - `channels/telegram/Bot.ts` 现在只保留 Telegram 渠道门面与编排。
   - `channels/telegram/TelegramPlatformClient.ts` 负责 Telegram polling/API/发送主逻辑。
   - `channels/telegram/TelegramInbound.ts` 负责 Telegram 入站归一化辅助。
   - `channels/feishu/Feishu.ts` 现在只保留 Feishu 渠道门面与编排。
   - `channels/feishu/FeishuPlatformClient.ts` 负责 Feishu runtime 宿主与 token/cache 状态。
   - `channels/feishu/FeishuPlatformLookup.ts` 负责 Feishu 用户/群聊/reply 查询与入站附件下载。
   - `channels/feishu/FeishuPlatformMessaging.ts` 负责 Feishu 消息发送与附件上传。
   - `channels/feishu/FeishuInbound.ts` 负责 Feishu 入站归一化辅助。
   - `channels/qq/QQ.ts` 现在只保留 QQ 渠道门面与编排。
   - `channels/qq/QQSupport.ts` 负责 QQ READY 身份解析、命令映射与入站增强组装。
  - `channels/qq/QQGatewayClient.ts` 负责 QQ Gateway runtime 宿主、WS 编排与重连调度。
  - `channels/qq/QQGatewaySupport.ts` 负责 QQ Gateway 状态快照、心跳判断与 payload 解析。
   - `channels/qq/QQGatewayAuth.ts` 负责 QQ 鉴权、Gateway URL 与 HTTP 连通性测试。
   - `channels/qq/QQGatewaySend.ts` 负责 QQ 回发请求构造、超时与自动重试。
   - `channels/qq/QQInbound.ts` 负责 QQ 入站归一化辅助。
2. `task/`
   - 负责任务定义、计划调度、手动执行与 run 落盘。
   - `TaskService.ts` 是实例入口，持有实例级 cron runtime 状态。
   - `runtime/TaskServiceActions.ts` 负责 action 注册表装配。
   - `runtime/TaskServiceSystem.ts` 负责 task system prompt。
   - `runtime/TaskActionInput.ts` 负责 CLI/API 输入映射。
   - `runtime/TaskActionExecution.ts` 负责 task 领域执行逻辑。
   - `runtime/TaskRunnerProgress.ts` 负责 progress 快照与文本辅助。
   - `runtime/TaskRunnerSession.ts` 负责 task 专用 session runtime。
   - `runtime/TaskRunnerRound.ts` 负责单轮执行与模拟用户判定。
   - `runtime/TaskRunArtifacts.ts` 负责 run 产物写入与 markdown/json 摘要格式。
   - `runtime/Runner.ts` 负责主编排并协调 run 产物写入。
3. `memory/`
   - 负责记忆提取、索引、检索与 flush。
   - `MemoryService.ts` 持有实例级 memory runtime 状态。
4. `shell/`
   - 负责 shell session 生命周期与命令执行。
   - `ShellService.ts` 持有实例级 shell session 状态。
   - `runtime/ShellActionRuntime.ts` 负责公开 action 编排。
   - `runtime/ShellActionRuntimeSupport.ts` 负责持久化、waiter 与 session 查找等共享运行时细节。
   - `session/tools/shell/ShellToolDefinition.ts` 作为 session tool facade，只做协议适配。
   - `session/tools/shell/ShellToolSchemas.ts` 负责 shell tool schema。
   - `session/tools/shell/ShellToolBridge.ts` 负责 runtime bridge 与响应整理。

## 统一服务模式

1. `Index.ts`
   - 只保留静态导出入口。
2. `<Domain>Service.ts`
   - 作为真正的 class service 实现。
3. `Action.ts`
   - 保留该领域的核心业务 helper，供 service/runtime 复用。
4. `runtime/`
   - 承载具体运行时实现、状态管理与输入映射。
5. `types/`
   - 存放领域内部协议；跨层共享契约统一提升到 `src/types/`。

## 边界约束

1. service 通过 `AgentContext` 读取运行时能力。
2. service 的实例状态应归属于 service instance，而不是模块级单例。
3. plugin 只能作为被动扩展，不替代 service 主流程。
4. service 间协作优先通过 `AgentContext.invoke`，而不是隐式全局状态。
