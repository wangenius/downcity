# SessionRecorder 统一消息与实时事件 PRD

## 1. 文档目的

本文档描述 `@downcity/agent` 中 Session Message、流式 Mutation、持久化与 EventHub 的统一设计。

本次设计要解决一个核心问题：

- Session 的实时事件和持久化历史目前由不同链路产生，导致同一轮对话在流式运行、完成同步、切换会话和重启后可能出现不同的顺序、身份和消息边界。

目标方案只保留一个 Session Message 事实源：

```text
messages.jsonl
```

所有 user、assistant、action、error 都由 `SessionRecorder` 按线性顺序写入。assistant 的 text、reasoning、tool、file 保留为 assistant parts，不提升为顶层 Message。

实时事件不再由业务模块单独拼装。`SessionRecorder` 持久化 Message Mutation 后，通过 EventHub 发布同一个 Mutation。Live 与 History 因此共享同一份身份、顺序和变化过程。

## 2. 背景与现状结论

当前 Session 同时存在以下事实来源：

- user message 由 Session runtime 写入 history。
- assistant 最终 message 在执行结束时写入 history。
- assistant text/reasoning/tool delta 由执行器回调直接发布。
- action 由 `SessionStateService` 等服务独立持久化并发布。
- 运行中的 assistant 另存为 inflight snapshot。
- `records({ view: "timeline" })` 再从最终 message parts 反向展开 UI timeline。

这会导致：

```text
Live event 顺序 != JSONL Message 顺序
Live assistant 身份 != 最终 assistant message 身份
assistant step 到达顺序 != assistant parts 最终顺序
steering 的实时 segment 边界无法从最终 combined assistant 恢复
```

问题不在于 JSONL 不能维护线性顺序，而在于当前没有一个组件统一负责：

- Message 身份。
- Message 逻辑顺序。
- Message revision。
- assistant delta 合并。
- 持久化与事件发布顺序。
- 重启后的状态重放。

## 3. 设计目标

本次设计必须满足：

1. 一个 Session 只有一个 Message 事实源。
2. Message 的顶层类型只有 `user`、`assistant`、`action`、`error`。
3. tool、reasoning、text、file 都保存在 assistant parts 中。
4. Message 在 Session 中拥有稳定 ID 和稳定线性顺序。
5. assistant 每产生一个 delta，前端都可以收到对应 delta event。
6. 每个对外 delta event 都对应一条已经持久化成功的正式 Mutation。
7. Live reducer 与 History replay 使用同一种 Mutation 规则。
8. steering 可以表达为 assistant segment A、user、assistant segment B。
9. action 状态更新不改变 action 原来的位置。
10. SessionRecorder 成为唯一 Message 写入和 Message Event 发布入口。

## 4. 非目标

本次设计不负责：

- 兼容旧 Session Message schema。
- 兼容旧 `text-delta` 等无 Message identity 的事件协议。
- 让 action、error 或 reasoning 进入 LLM 输入。
- 把 tool 提升为独立顶层 Message。
- 让 SessionRecorder 负责模型调用或 turn 调度。
- 通过最终 history 覆盖 live state 来实现收敛。
- 通过 role 数量、文本内容或数组位置匹配消息。

## 5. 核心设计结论

整个设计只有三个核心概念：

### 5.1 SessionMessage

Message 是 UI 和 Session 历史最终读取到的当前状态。

```text
User      = 创建一次
Error     = 创建一次
Action    = 创建后更新状态
Assistant = 创建后持续应用 delta，最后完成
```

### 5.2 SessionMessageMutation

Mutation 描述 Message 的一次变化。

```text
message-created
assistant-part-delta
assistant-part-updated
message-updated
message-completed
```

Mutation 既写入 JSONL，也作为 EventHub 的实时 payload。

### 5.3 SessionRecorder

Recorder 是 Message 的唯一管理者：

```text
业务模块
  -> SessionRecorder
  -> 持久化 Mutation
  -> 更新内存 Message
  -> EventHub.publish(同一个 Mutation)
```

## 6. Message 数据模型

Session Message 是以下四种消息的联合类型，不再额外包装其他持久化实体：

```ts
type SessionMessage =
  | SessionUserMessage
  | SessionAssistantMessage
  | SessionActionMessage
  | SessionErrorMessage;
```

### 6.1 公共字段

```ts
type SessionMessageBase = {
  /** 当前 Message 在 Session 内的稳定唯一标识。 */
  message_id: string;

  /** 当前 Message 所属 Session 的稳定标识。 */
  session_id: string;

  /** 当前 Message 所属 turn；独立 Session action 可以省略。 */
  turn_id?: string;

  /** 当前 Message 的线性位置；创建后永远不变。 */
  sequence: number;

  /** 当前 Message 的版本号；每次 Mutation 后递增。 */
  revision: number;

  /** 当前 Message 是否默认对用户可见。 */
  visibility: "visible" | "internal";

  /** 当前 Message 首次创建时间。 */
  created_at: number;

  /** 当前 Message 最近一次更新时间。 */
  updated_at: number;

  /** 当前 Message 从其他 Session 导入时的可选来源信息。 */
  origin?: {
    /** 来源 Session 的稳定标识。 */
    session_id: string;
    /** 来源 Message 的稳定标识。 */
    message_id: string;
    /** 来源 Message 所属 turn。 */
    turn_id?: string;
  };
};
```

`sequence` 是 Session 级单调递增整数。

关键规则：

- 只在创建 Message 时分配。
- update、delta、complete 都不改变 sequence。
- UI 永远按 sequence 排序。
- JSONL 物理行号不直接决定 UI 位置。

### 6.2 User Message

```ts
type SessionUserMessage = SessionMessageBase & {
  /** Message 类型固定为 user。 */
  type: "user";

  /** 普通 prompt 或当前 turn 中的 steering 输入。 */
  input_type: "prompt" | "steer";

  /** 用户消息的结构化 parts。 */
  parts: SessionUserPart[];
};
```

User Message 创建后默认不可修改。rewrite 应创建新的 branch 或新的 Message，不原位改变已经发生的用户输入。

### 6.3 Assistant Message

```ts
type SessionAssistantMessage = SessionMessageBase & {
  /** Message 类型固定为 assistant。 */
  type: "assistant";

  /** 普通 assistant segment 或仅供 Context Composer 使用的 compact summary。 */
  message_type: "normal" | "summary";

  /** 当前 assistant 在所属 turn 内的 segment 序号，从 1 开始。 */
  segment_index: number;

  /** 当前 assistant 的执行状态。 */
  status: "streaming" | "completed" | "stopped" | "failed";

  /** assistant 内按真实生成顺序保存的 parts。 */
  parts: SessionAssistantPart[];
};
```

Assistant parts 至少支持：

```ts
type SessionAssistantPart =
  | {
      /** part 稳定标识。 */
      part_id: string;
      /** part 类型固定为 text。 */
      type: "text";
      /** 已累计的可见文本。 */
      text: string;
    }
  | {
      /** part 稳定标识。 */
      part_id: string;
      /** part 类型固定为 reasoning。 */
      type: "reasoning";
      /** 已累计的 reasoning 文本。 */
      text: string;
    }
  | {
      /** part 稳定标识。 */
      part_id: string;
      /** part 类型固定为 tool。 */
      type: "tool";
      /** 模型工具调用的稳定标识。 */
      tool_call_id: string;
      /** 工具名称。 */
      tool_name: string;
      /** 工具当前状态。 */
      state:
        | "input-streaming"
        | "approval-required"
        | "running"
        | "completed"
        | "failed";
      /** 工具输入。 */
      input?: JsonValue;
      /** 工具成功输出。 */
      output?: JsonValue;
      /** 工具失败信息。 */
      error?: string;
    }
  | {
      /** part 稳定标识。 */
      part_id: string;
      /** part 类型固定为 file。 */
      type: "file";
      /** 文件媒体类型。 */
      media_type: string;
      /** 文件可读取地址或 data URL。 */
      url: string;
    };
```

一个 turn 可以产生多个 Assistant Message。每次 steering 都会结束当前 segment，并在 steering user 后创建下一个 segment。

### 6.4 Action Message

```ts
type SessionActionMessage = SessionMessageBase & {
  /** Message 类型固定为 action。 */
  type: "action";

  /** action 业务类型。 */
  action_type: "model-switch" | "compact" | "fork" | string;

  /** action 当前状态。 */
  status: "running" | "completed" | "failed";

  /** action 展示标题。 */
  title: string;

  /** action 展示描述。 */
  description?: string;

  /** action 附加结构化信息。 */
  data?: JsonObject;
};
```

Action 从 running 到 completed/failed 时：

```text
message_id 不变
sequence 不变
revision + 1
```

### 6.5 Error Message

```ts
type SessionErrorMessage = SessionMessageBase & {
  /** Message 类型固定为 error。 */
  type: "error";

  /** 错误影响范围。 */
  scope: "session" | "turn";

  /** 稳定错误码。 */
  code: string;

  /** 用户可见错误信息。 */
  message: string;

  /** 当前错误是否允许重试恢复。 */
  recoverable: boolean;
};
```

只有用户需要看到的错误才写入 Error Message。内部异常继续进入 logger，不自动污染 Session Message。

## 7. Mutation 与 Event 协议

### 7.1 Mutation 公共字段

```ts
type SessionMessageMutationBase = {
  /** 当前 Mutation 的稳定唯一标识。 */
  mutation_id: string;

  /** 当前 Mutation 在 Session 内的提交序号。 */
  commit_sequence: number;

  /** Mutation 目标 Message。 */
  message_id: string;

  /** 目标 Message 的逻辑位置。 */
  sequence: number;

  /** 应用 Mutation 后的 Message revision。 */
  revision: number;

  /** 当前 Mutation 所属 Session。 */
  session_id: string;

  /** 当前 Mutation 所属 turn。 */
  turn_id?: string;

  /** Mutation 创建时间。 */
  created_at: number;
};
```

`commit_sequence` 用于：

- EventHub 严格排序。
- 断线重连增量读取。
- 多窗口收敛。
- 判断是否遗漏 Mutation。

它不用于 UI 排序。UI 排序只使用 Message `sequence`。

### 7.2 Message Created

```ts
type SessionMessageCreatedMutation = SessionMessageMutationBase & {
  /** Mutation 类型固定为 message-created。 */
  type: "message-created";

  /** 新创建的完整 Message。 */
  message: SessionMessage;
};
```

适用于：

- user 创建。
- assistant segment 创建。
- action 创建。
- error 创建。

### 7.3 Assistant Part Delta

```ts
type SessionAssistantPartDeltaMutation = SessionMessageMutationBase & {
  /** Mutation 类型固定为 assistant-part-delta。 */
  type: "assistant-part-delta";

  /** delta 所属 assistant part。 */
  part_id: string;

  /** delta 对应 text 或 reasoning。 */
  part_type: "text" | "reasoning";

  /** 本次新增文本，不是累计全文。 */
  delta: string;
};
```

每个模型 delta 对应一个 Mutation。Recorder 可以批量写入多行 JSONL，但不能合并或丢弃对外 delta 语义。

### 7.4 Assistant Part Updated

```ts
type SessionAssistantPartUpdatedMutation = SessionMessageMutationBase & {
  /** Mutation 类型固定为 assistant-part-updated。 */
  type: "assistant-part-updated";

  /** 被创建或更新的完整 part。 */
  part: SessionAssistantPart;
};
```

适用于：

- tool-call 创建。
- tool input 更新。
- approval 状态更新。
- tool-result 完成。
- file part 写入。

### 7.5 Message Updated

```ts
type SessionMessageUpdatedMutation = SessionMessageMutationBase & {
  /** Mutation 类型固定为 message-updated。 */
  type: "message-updated";

  /** 更新后的完整 Action 或其他非 delta Message。 */
  message: SessionMessage;
};
```

主要用于 action running -> completed/failed。

### 7.6 Message Completed

```ts
type SessionMessageCompletedMutation = SessionMessageMutationBase & {
  /** Mutation 类型固定为 message-completed。 */
  type: "message-completed";

  /** assistant 最终状态。 */
  status: "completed" | "stopped" | "failed";
};
```

该 Mutation 关闭 assistant segment。关闭后的 Assistant Message 不再接受 delta。

## 8. JSONL 存储模型

单个 Session 只维护一个 Message log：

```text
.downcity/agents/<agent_id>/sessions/<session_id>/messages/messages.jsonl
```

JSONL 每行保存一条完整 Mutation：

```json
{"type":"message-created","commit_sequence":1,"message_id":"user_1","message":{"type":"user"}}
{"type":"message-created","commit_sequence":2,"message_id":"assistant_1","message":{"type":"assistant","status":"streaming"}}
{"type":"assistant-part-delta","commit_sequence":3,"message_id":"assistant_1","part_id":"text_1","delta":"你"}
{"type":"assistant-part-delta","commit_sequence":4,"message_id":"assistant_1","part_id":"text_1","delta":"好"}
{"type":"message-completed","commit_sequence":5,"message_id":"assistant_1","status":"completed"}
```

Recorder 初始化时按 `commit_sequence` 重放 Mutation，生成内存 Message Map：

```text
Map<message_id, SessionMessage>
```

重放完成后：

- 当前最大 Message sequence + 1 是下一条 Message sequence。
- 当前最大 commit_sequence + 1 是下一条 commit_sequence。
- 不需要第二份 timeline 文件维护顺序。

## 9. SessionRecorder 职责

SessionRecorder 必须负责：

1. 为 Message 生成 ID。
2. 为新 Message 分配 sequence。
3. 为 Mutation 生成 mutation ID 和 commit_sequence。
4. 维护 Message revision。
5. 校验 Message 生命周期状态。
6. 把 assistant chunk 归一化成 part Mutation。
7. 串行持久化所有 Mutation。
8. 更新内存 Message 状态。
9. 持久化成功后发布同一个 Mutation。
10. 提供 snapshot、分页、增量读取与订阅。
11. 重启时恢复未完成 Message。

SessionRecorder 不负责：

- 决定 prompt 是否 steering。
- 决定何时切换模型。
- 调用 LLM。
- 执行 tool。
- 生成 Session title。
- 生成 LLM compact summary。
- 决定业务 action 的标题和描述。

## 10. SessionRecorder API

建议接口：

```ts
interface SessionRecorder {
  /** 创建一条普通或 steering user message。 */
  append_user_message(input: AppendSessionUserMessageInput): Promise<SessionUserMessage>;

  /** 创建一个可持续接收 chunk 的 assistant segment。 */
  open_assistant_message(
    input: OpenSessionAssistantMessageInput,
  ): Promise<SessionAssistantMessageWriter>;

  /** 创建一个可完成或失败的 action。 */
  open_action_message(input: OpenSessionActionMessageInput): Promise<SessionActionMessageWriter>;

  /** 创建一条用户可见 error。 */
  append_error_message(input: AppendSessionErrorMessageInput): Promise<SessionErrorMessage>;

  /** 写入一条仅供 Context Composer 使用的内部 assistant summary。 */
  append_internal_assistant_message(
    input: AppendInternalAssistantMessageInput,
  ): Promise<SessionAssistantMessage>;

  /** 读取当前 Message snapshot。 */
  list_messages(input?: ListSessionMessagesInput): Promise<SessionMessagePage>;

  /** 从指定 commit cursor 读取 Mutation。 */
  list_message_changes(input: ListSessionMessageChangesInput): Promise<SessionMessageMutationPage>;

  /** 订阅持久化成功后的未来 Mutation。 */
  subscribe(
    subscriber: SessionMessageMutationSubscriber,
  ): SessionUnsubscribe;

  /** 向新 Session 导入 fork 来源 Message。 */
  import_messages(input: ImportSessionMessagesInput): Promise<void>;
}
```

Assistant writer：

```ts
interface SessionAssistantMessageWriter {
  /** 当前 writer 绑定的 assistant message ID。 */
  readonly message_id: string;

  /** 应用一个原始模型 UI chunk。 */
  apply_chunk(chunk: SessionAssistantChunk): Promise<void>;

  /** 等待当前所有 delta Mutation 完成持久化和发布。 */
  flush(): Promise<void>;

  /** 正常完成当前 assistant segment。 */
  complete(): Promise<void>;

  /** 停止当前 assistant segment 并保留已有内容。 */
  stop(): Promise<void>;

  /** 以失败状态关闭当前 assistant segment。 */
  fail(error: unknown): Promise<void>;
}
```

Action writer：

```ts
interface SessionActionMessageWriter {
  /** 当前 writer 绑定的 action message ID。 */
  readonly message_id: string;

  /** 把 action 更新为 completed。 */
  complete(input?: CompleteSessionActionMessageInput): Promise<void>;

  /** 把 action 更新为 failed。 */
  fail(error: unknown): Promise<void>;
}
```

调用方不直接传 revision，也不自行复用 Message ID。Writer 负责保护单个 Message 的生命周期。

## 11. EventHub 设计

EventHub 继续作为内存事件广播器，但不再是事实生产者。

```text
SessionRecorder = 事实生产者
Message Store    = 事实持久化
EventHub        = 事实广播器
Vibecape        = 事实消费者
```

Recorder 的统一 commit 流程：

```ts
async function commit_mutation(mutation) {
  await message_store.append(mutation);
  message_reducer.apply(mutation);
  event_hub.publish(mutation);
}
```

强制规则：

- EventHub 发布的对象就是刚持久化的 Mutation。
- EventHub 不再发布缺少 `message_id`、`sequence`、`revision` 的 assistant delta。
- 业务服务不能直接发布 Message Mutation。
- 持久化失败时不发布 Mutation。
- Event subscriber 失败不能影响 Recorder 和其他 subscriber。

`turn-start`、`turn-finish`、`session-title` 属于生命周期或 metadata event，不是 Session Message Mutation。它们可以继续通过独立的 lifecycle event channel 发布，但不能参与 Message 排序和 UI 消息合并。

## 12. 场景调用逻辑

### 12.1 普通 User Message

调用方：`SessionPromptRuntime`。

```ts
const user_message = await recorder.append_user_message({
  turn_id,
  input_type: "prompt",
  parts: user_parts,
});
```

内部流程：

```text
创建 User Message
-> 分配 sequence/revision
-> 持久化 message-created
-> EventHub 发布 message-created
```

User 成功持久化后，turn 才允许进入模型执行。

### 12.2 普通 Assistant Streaming

调用方：`SessionTurnService` 创建 writer，并把 writer 的 chunk callback 交给 Executor。

```ts
const assistant_writer = await recorder.open_assistant_message({
  turn_id,
  segment_index: 1,
});

const result = await executor.run({
  query,
  on_ui_message_chunk: async (chunk) => {
    await assistant_writer.apply_chunk(chunk);
  },
});

await assistant_writer.complete();
```

每个 text delta：

```text
模型产生 delta
-> writer.apply_chunk(delta)
-> 持久化 assistant-part-delta
-> EventHub 发布 assistant-part-delta
-> 前端立即追加 delta
```

最终顺序：

```text
sequence=1 user
sequence=2 assistant
```

### 12.3 Reasoning

Reasoning 仍属于当前 Assistant Message：

```ts
await assistant_writer.apply_chunk({
  type: "reasoning-delta",
  delta,
});
```

Recorder 为 reasoning part 分配稳定 `part_id`，并发布：

```text
assistant-part-delta
part_type=reasoning
```

Reasoning 不创建顶层 Message，不进入 LLM history projection。

### 12.4 Tool Call / Tool Result

Tool 始终是当前 Assistant Message 的 part。

```ts
await assistant_writer.apply_chunk({
  type: "tool-call",
  tool_call_id,
  tool_name,
  input,
});

await assistant_writer.apply_chunk({
  type: "tool-result",
  tool_call_id,
  output,
});
```

Recorder 根据 `tool_call_id` 定位稳定 tool part：

```text
tool-call   -> 创建或更新 tool part
approval    -> 更新同一个 tool part
tool-result -> 更新同一个 tool part 为 completed
tool-error  -> 更新同一个 tool part 为 failed
```

EventHub 发布 `assistant-part-updated`，不发布独立 Tool Message。

Shell、Plugin 等工具运行时不直接调用 Recorder。它们把 tool 结果返回 Executor，由 assistant writer 统一记录。

### 12.5 Model Switch

如果模型切换属于本次 prompt，固定调用顺序：

```ts
await recorder.append_user_message({
  turn_id,
  input_type: "prompt",
  parts,
});

const action = await recorder.open_action_message({
  turn_id,
  action_type: "model-switch",
  title: switching_title,
});

try {
  await model_service.set_model(model_id);
  await action.complete({ title: completed_title });
} catch (error) {
  await action.fail(error);
  throw error;
}

const assistant = await recorder.open_assistant_message({
  turn_id,
  segment_index: 1,
});
```

最终顺序：

```text
sequence=1 user
sequence=2 model-switch action
sequence=3 assistant
```

如果宿主独立调用 `session.set_model()` 后才调用 `session.prompt()`，则 action 本来就应该排在 user 前。SDK 不根据 UI 偏好隐式重排调用顺序。

为了支持 `user -> model-switch -> assistant`，推荐公开原子入口：

```ts
session.prompt({
  query,
  model_id,
});
```

### 12.6 Steering

调用方：`SessionPromptRuntime` 在 step 边界确认 queued prompt 被当前 turn 吸收。

```ts
await current_assistant.flush();
await current_assistant.complete();

await recorder.append_user_message({
  turn_id,
  input_type: "steer",
  parts: steer_parts,
});

current_assistant = await recorder.open_assistant_message({
  turn_id,
  segment_index: next_segment_index,
});
```

最终顺序：

```text
sequence=1 user(prompt)
sequence=2 assistant segment A
sequence=3 user(steer)
sequence=4 assistant segment B
```

不再创建 `Session steer message sent` action，因为 steering User Message 已经完整表达该事实。

### 12.7 Stop / Cancel

如果 assistant 已经创建：

```ts
await assistant_writer.flush();
await assistant_writer.stop();
```

已有 text/reasoning/tool parts 保留，Message 状态变为 stopped，sequence 不变。

如果尚未创建 assistant，则不生成空 assistant Message。

被取消且尚未进入 turn 的 queued prompt 不写 User Message。是否向调用方返回取消错误由 TurnHandle 负责，不创建伪造聊天消息。

### 12.8 用户可见 Error

执行失败时先关闭 partial assistant：

```ts
await assistant_writer.flush();
await assistant_writer.fail(error);
```

只有错误需要显示为独立 UI item 时才追加 Error Message：

```ts
await recorder.append_error_message({
  turn_id,
  scope: "turn",
  code: "executor_failed",
  message: user_visible_message,
  recoverable: true,
});
```

Recorder 自身持久化失败时不能再尝试通过同一个 Recorder 写 Error Message，应直接抛出并写 logger。

### 12.9 Compact

Compact 是独立 Action Message：

```ts
const action = await recorder.open_action_message({
  action_type: "compact",
  title: "Compacting session context",
});

try {
  const summary = await compaction_service.compact();
  await recorder.append_internal_assistant_message({
    message_type: "summary",
    parts: summary.parts,
  });
  await action.complete();
} catch (error) {
  await action.fail(error);
}
```

Compact summary 仍然是：

```text
type=assistant
visibility=internal
message_type=summary
```

它供 Context Composer 使用，但 UI 默认过滤。Compact 不删除用户可见 Message，不改变原 Message sequence。

### 12.10 Fork

源 Session：

```ts
const action = await source_recorder.open_action_message({
  action_type: "fork",
  title: "Forking session",
});
```

目标 Session：

```ts
const source_messages = await source_recorder.list_messages({
  through_sequence: anchor_sequence,
});

await target_recorder.import_messages({
  source_session_id,
  messages: source_messages.items,
});
```

导入时由目标 Recorder：

- 重新分配 session_id。
- 重新分配 Message sequence。
- 重新生成 message_id。
- 重建 turn_id 映射。
- 保存可选 `origin_message_id` 追踪来源。

完成后源 action 更新为 completed；失败则更新为 failed。

### 12.11 Session 恢复

Recorder 初始化时重放全部 Mutation。

如果发现进程中断前仍存在：

```text
assistant.status=streaming
action.status=running
```

Recorder 追加恢复 Mutation：

```text
streaming assistant -> stopped
running action       -> failed
```

不创建新 Message，不复用新的 ID，不移动原 sequence。

## 13. 前端消费逻辑

Vibecape 使用一个 Message reducer 同时处理 live 与 history replay：

```ts
function reduce_session_message(state, mutation) {
  switch (mutation.type) {
    case "message-created":
      return create_message(state, mutation.message);

    case "assistant-part-delta":
      return append_part_delta(state, mutation);

    case "assistant-part-updated":
      return upsert_assistant_part(state, mutation);

    case "message-updated":
      return replace_newer_revision(state, mutation.message);

    case "message-completed":
      return complete_message(state, mutation);
  }
}
```

前端规则：

- 按 `commit_sequence` 应用 Mutation。
- 按 `message_id` 定位 Message。
- 按 `part_id` 或 `tool_call_id` 定位 part。
- 拒绝小于等于当前 revision 的重复 Mutation。
- 按 Message `sequence` 展示。
- 不按 role 数量或数组位置匹配 live/history。

冷启动可以直接读取折叠后的 Message snapshot；断线重连使用 `after_commit_sequence` 拉取 Mutation delta。

## 14. History 与 LLM Context Projection

Session Message 是唯一事实源，但 UI 和 LLM 可以有不同投影。

Context Composer 按 Message sequence 读取：

```text
visible user       -> LLM user message
visible assistant  -> LLM assistant message/parts
internal summary   -> LLM compact context
action             -> 过滤
error              -> 过滤
reasoning part      -> 按模型策略过滤
tool part           -> 按模型/provider 策略转换或过滤
```

steering 不再依赖最终 combined assistant：

```text
user(prompt)
assistant segment A
user(steer)
assistant segment B
```

Composer 可以按目标模型协议合并连续的同 role message，但不能修改持久化 Message，也不能影响 UI 顺序。

## 15. 并发与顺序保证

单个 SessionRecorder 内部使用一个串行 commit queue。

所有来源：

```text
prompt input
assistant delta
tool update
steering
action update
error
```

都进入同一个队列后分配 commit_sequence。

关键边界：

- 初始 user commit 完成后才能执行模型。
- model-switch action commit 完成后才能切换模型。
- 当前 assistant flush/complete 后才能写 steering user。
- steering user commit 完成后才能创建下一个 assistant segment。
- turn finish 前必须等待 assistant complete commit。

## 16. 性能设计

逐 delta 流式必须保留，但不要求每个 delta 单独执行一次文件打开操作。

Recorder 应：

- 长期持有 append writer 或复用单一写入队列。
- 在极短窗口内批量写入多条独立 JSONL Mutation。
- 批量写入成功后仍按 commit_sequence 逐条发布 EventHub event。
- 不合并两个模型 delta 的业务语义。
- step、steering、stop、turn finish 时强制 flush。
- 不在每个 delta 后重写完整 Message 或完整 JSONL。

可以在 turn 边界执行 `fsync`。是否每个 delta 都 `fsync` 不作为默认要求，但每个 delta 必须先完成有序 append，再对外发布。

## 17. 失败语义

### 17.1 User 持久化失败

- 不发布 user event。
- 不启动模型执行。
- prompt 失败。

### 17.2 Assistant delta 持久化失败

- 不发布对应 delta。
- 中止当前 turn。
- 已经成功提交的 partial assistant 保留。
- 通过 logger 记录 Recorder 错误。

### 17.3 Action 创建失败

- 不执行业务 action。
- 调用方收到失败。

### 17.4 Action 完成状态写入失败

- 不发布 completed event。
- action 保持 running；恢复时标记 failed。
- 调用方收到持久化失败，不能伪装成完整成功。

### 17.5 EventHub subscriber 失败

- 不回滚已经持久化的 Mutation。
- 不影响其他 subscriber。
- 失败 subscriber 通过 `list_message_changes({ after_commit_sequence })` 恢复。

## 18. 模块职责调整

### SessionPromptRuntime

负责：

- 创建 turn_id。
- 判断 prompt 进入当前 turn 还是下一 turn。
- 调用 `recorder.append_user_message()`。
- 在 steering 边界关闭旧 assistant、写 user、创建新 assistant。

不再直接持久化 message 或发布 steer action。

### SessionTurnService

负责：

- 创建 AssistantMessageWriter。
- 把 Executor chunk 转交给 AssistantMessageWriter。
- 在执行完成、停止或失败时关闭 writer。

不再映射和发布独立 text/tool/reasoning Session event。

### SessionStateService

负责：

- Session config 和 model 状态。
- 通过 Recorder 创建/更新 model-switch action。

不再提供 `persist_action_event()` / `emit_action_event()`。

### Executor

负责：

- 运行模型。
- 产生标准 UI chunk。

Executor 不直接依赖 SessionRecorder。Recorder 由 SessionTurnService 通过 callback/writer port 注入，避免 Executor 与 Session 存储耦合。

### SessionViewService

负责：

- 读取 Recorder snapshot。
- 通过 Recorder 完成 fork action 和目标导入。

不再直接调用 HistoryStore `write_records()`。

### JsonlSessionMessageStore

负责：

- JSONL append。
- 文件锁。
- Mutation 顺序读取。
- 批量写入。

Store 不负责 EventHub、Message reducer 或业务状态转换。

## 19. 需要删除或替换的旧能力

完成改造后应删除或收口：

- `SessionHistoryWriter.append_user_message()` 直接写 Store。
- `SessionHistoryWriter.append_assistant_message()` 直接写 Store。
- `ExecutorInflightService` 和独立 inflight assistant 文件。
- `persist_action_event()`。
- `emit_action_event()`。
- `onUiMessageChunkCallback()` 直接发布 Session event。
- `assistant-step` 作为 UI 文本 fallback。
- `records({ view: "timeline" })` 从最终 assistant parts 反向展开。
- action JSONL 全文件 upsert rewrite。
- live/history 按 role、文本或数组 index 配对。

`assistant-step` 可以保留为 Executor 内部 step 边界信号，但不再作为对外可见 Message 内容来源。

## 20. 公开 API 建议

```ts
const turn = await session.prompt({
  request_id,
  query,
  model_id,
});

const unsubscribe = session.subscribe((mutation) => {
  apply_session_message_mutation(mutation);
});

const page = await session.messages({
  before_sequence,
  limit: 50,
});

const changes = await session.message_changes({
  after_commit_sequence,
  limit: 500,
});
```

`session.messages()` 返回折叠后的 `SessionMessagePage`，其中 `items` 是线性 `SessionMessage[]`，不再需要 message/timeline 双 view。

`session.subscribe()` 发布 `SessionMessageMutation`。生命周期事件如确有需要，应通过单独 API 暴露，避免消费者再次把 lifecycle event 当作聊天 Message。

## 21. 测试矩阵

| 场景 | 必须断言 |
| --- | --- |
| 普通文本 | 每个 delta 按顺序发布，reload 后文本一致 |
| reasoning + text | part 顺序和 part_id 在 live/history 中一致 |
| 单 tool | tool-call/result 更新同一个 assistant part |
| 多 tool | tool_call_id 不串线，part 顺序稳定 |
| tool approval | approval 与 result 原位更新同一个 part |
| model switch | user/action/assistant 顺序与调用顺序一致 |
| model 未变化 | 不创建 action |
| 单次 steering | assistant A/user/assistant B 顺序不变 |
| 多次 steering | 每次创建新 assistant segment |
| stop during text | partial text 保留，assistant=stopped |
| stop during tool | tool 与 partial assistant 保持原位置 |
| error after text | assistant failed 后 error 顺序稳定 |
| Recorder 写失败 | 未持久化 Mutation 不得发布 |
| subscriber 失败 | 其他 subscriber 不受影响，可增量恢复 |
| restart inflight | streaming/running Message 原位收敛 |
| history pagination | 已加载 Message ID 和 sequence 不变化 |
| delta overlap | 按 commit_sequence/revision 去重 |
| fork | 目标顺序一致，ID/turn 映射正确 |
| compact | visible Message 不丢，summary 仅供 context |

## 22. 验收标准

只有满足以下条件才算完成：

1. 所有可见 Message 都通过 SessionRecorder 创建或更新。
2. Message Store 之外不存在第二份 UI timeline 事实源。
3. user、assistant、action、error 共享统一 sequence。
4. assistant text/reasoning/tool/file 都属于 assistant parts。
5. 每个模型 delta 都能产生独立、带 Message identity 的 EventHub event。
6. EventHub 只发布持久化成功后的 Mutation。
7. Live reducer 与 JSONL replay 使用同一个 Mutation reducer。
8. steering 重启后仍保持 assistant A/user/assistant B。
9. action 状态更新不改变 sequence。
10. turn finish 前 assistant 已完成最终 Mutation。
11. 不再通过最终 history 整体覆盖 live state。
12. 不再通过 role 数量、文本或数组位置匹配消息。
13. 普通 turn、model switch、tool、steering、stop、error、恢复、分页测试全部通过。

## 23. 推荐实施顺序

### 阶段一：类型与 Recorder 核心

- 定义 Message、Part、Mutation 类型。
- 实现 JSONL Mutation Store。
- 实现 Message reducer。
- 实现 sequence、revision、commit_sequence。
- 实现 Recorder subscribe/list_messages/list_message_changes。

### 阶段二：User、Action、Error 接入

- Prompt user 改由 Recorder 写入。
- Model switch、compact、fork 改用 ActionMessageWriter。
- 用户可见错误改由 Recorder 写入。
- 删除 action 独立持久化与发布链路。

### 阶段三：Assistant Streaming 接入

- 实现 AssistantMessageWriter。
- 接入 text/reasoning/tool/file chunk。
- EventHub 发布逐 delta Mutation。
- 删除旧 inflight 和独立 assistant event mapper。

### 阶段四：Steering 与恢复

- steering 改为 assistant segment 边界。
- 实现未完成 Message 恢复。
- 删除最终 combined assistant 作为 UI 事实源的逻辑。

### 阶段五：读取、远程与宿主接入

- `session.messages()` 返回 canonical Message。
- 增加 message changes cursor。
- Remote Session 透传同一 Mutation。
- Vibecape 使用统一 reducer。
- 删除 timeline view 和 role/index merge。

## 24. 最终结论

SessionRecorder 不是新的 Timeline 系统，而是现有 Session Message/Action/Event 能力的统一收口。

最终数据流应固定为：

```text
业务发生
-> SessionRecorder 创建 Mutation
-> messages.jsonl 持久化
-> Message reducer 更新状态
-> EventHub 发布同一个 Mutation
-> Live UI 应用 Mutation
-> History 通过相同 Mutation 重放得到同一状态
```

整个 Session 只维护一条线性 Message 序列。UI、LLM Context 和远程 transport 都是这条序列的消费者，不再各自维护或猜测另一套消息事实。
