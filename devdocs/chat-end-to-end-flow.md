# Downcity Chat 端到端流程

这份文档只解释一件事：

**一条 chat 消息现在是怎么从渠道进入，到 session 执行，再回到渠道的。**

---

## 1. 总流程图

```mermaid
sequenceDiagram
  participant Channel as Telegram/Feishu/QQ
  participant Base as BaseChatChannel
  participant Queue as ChatQueue
  participant Worker as ChatQueueWorker
  participant Runtime as ExecutionRuntime
  participant Plugin as runtime.plugins
  participant Session as runtime.session
  participant Sender as Chat Sender

  Channel->>Base: 入站消息
  Base->>Plugin: guard / pipeline
  Base->>Queue: enqueueChatQueue(exec)
  Worker->>Session: appendUserMessage + run()
  Worker->>Plugin: beforeReply / afterReply
  Worker->>Sender: send reply
  Sender-->>Channel: 回发到平台
```

---

## 2. 渠道接入层

当前平台适配器包括：

- `services/chat/channels/telegram/Bot.ts`
- `services/chat/channels/feishu/Feishu.ts`
- `services/chat/channels/qq/QQ.ts`

其中 Telegram 渠道已经进一步拆分为：

- `services/chat/channels/telegram/Bot.ts`
- `services/chat/channels/telegram/TelegramPlatformClient.ts`
- `services/chat/channels/telegram/TelegramInbound.ts`

其中 QQ 渠道已经进一步拆分为：

- `services/chat/channels/qq/QQ.ts`
- `services/chat/channels/qq/QQGatewayClient.ts`
- `services/chat/channels/qq/QQInbound.ts`

其中 Feishu 渠道也已经进一步拆分为：

- `services/chat/channels/feishu/Feishu.ts`
- `services/chat/channels/feishu/FeishuPlatformClient.ts`
- `services/chat/channels/feishu/FeishuInbound.ts`

它们统一继承：

- `services/chat/channels/BaseChatChannel.ts`

这意味着各平台虽然各自解析消息，但会收敛到统一入队逻辑。

---

## 3. 入站阶段发生什么

`BaseChatChannel` 负责：

1. 计算 `chatKey`
2. 观测入站主体
3. 调授权 guard
4. 解析/增强入站文本与附件
5. 根据平台目标解析或创建 `sessionId`
6. 写 history / meta / ingress
7. 触发 `prepareChatEnqueue()`
8. 调 `enqueueChatQueue()` 入队

这里最关键的是：

- 渠道层不直接执行模型
- 渠道层只负责把消息整理并送入 queue

---

## 4. queue 阶段发生什么

执行器是：

- `services/chat/runtime/ChatQueueWorker.ts`

它负责：

1. 监听 queue lane
2. 同 lane 串行执行
3. 启动前消息合并
4. 通过 `ChatQueueSessionBridge` 把 ingress/error/result 写入 session
5. 调 `runtime.session.run()` 执行
6. 处理 assistant 输出
7. 发送回复

所以 chat service 的主执行中枢其实是 `ChatQueueWorker`。

---

## 5. plugin 在 chat 流程里怎么参与

### 入队前

通过：

- `services/chat/runtime/EnqueueDispatch.ts`

主要点位：

1. `prepareChatEnqueue()`
2. `emitChatEnqueueEffect()`

### 回复前后

通过：

- `services/chat/runtime/ReplyDispatch.ts`

主要点位：

1. `prepareChatReplyText()`
2. `emitChatReplyEffect()`

也就是说，plugin 只在固定点增强 chat 流程，不直接控制 queue 或 session。

---

## 6. session 执行阶段

`ChatQueueWorker` 与 session 之间现在多了一层薄桥接：

- `services/chat/runtime/ChatQueueSessionBridge.ts`

它负责：

1. queue ingress 是否需要补写到 session
2. step 合并时如何构造 `SessionUserMessageV1`
3. 运行失败时如何补写 assistant error
4. 运行完成后如何补写最终 assistant 与 deferred user messages

然后 `ChatQueueWorker` 再调用：

```ts
runtime.session.run({ sessionId, query })
```

链路实际变成：

1. `ExecutionRuntime.session`
2. `SessionRegistry`
3. `SessionRuntimeRegistry`
4. `SessionRuntime`
5. `SessionCore`

真正的 prompt、工具、模型调用，都在这条链里完成。

---

## 7. 回复阶段

session 返回结果后，`ChatQueueWorker` 会：

1. 提取用户可见文本
2. 走 `prepareChatReplyText()`
3. 解析 chat reply target
4. 调 sender 回发到平台
5. 走 `emitChatReplyEffect()`

边界很清楚：

1. session 负责产出结果
2. chat service 负责如何发送
3. plugin 只能在固定点增强

---

## 8. 当前这条链路最值得记住的结论

1. 渠道适配器不直接执行模型
2. chat queue 把入站流量变成有序执行流
3. 真正执行仍然发生在 session
4. 回复策略属于 chat service
5. plugin 只是增强，不是主流程控制器
