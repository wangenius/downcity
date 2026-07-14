# SessionRecorder 逻辑 PRD

## 1. 目标

SessionRecorder 是 Agent Session 中 Message 的唯一写入入口，负责三件事：

1. 维护 `user | assistant | action | error` 四类 `SessionMessage`。
2. 保证实时 EventHub 与最终历史使用同一份 Message 状态。
3. 在流式生成期间保存可恢复的 Assistant 草稿，但不把 `part/delta` 写入历史日志。

本设计不保留旧 Mutation 日志与 `message_changes` 增量接口。

## 2. 核心模型

```ts
type SessionMessage =
  | SessionUserMessage
  | SessionAssistantMessage
  | SessionActionMessage
  | SessionErrorMessage;
```

每个 Message 都有：

- `message_id`：稳定身份。
- `sequence`：在 Session 中的不可变线性顺序。
- `revision`：同一 Message 的版本号。
- `created_at` / `updated_at`：创建与更新时间。

Assistant 的 text、reasoning、tool、file、data 都是 `parts`，不是顶层 Message。每个 Part 都有：

- `part_id`：在 Assistant Message 内的稳定身份。
- `sequence`：在 Assistant Message 内的不可变线性顺序。
- `type`：`text | reasoning | tool | file | data`。

Tool 状态更新只能替换原 Part，不得创建新的 Part 或改变 `sequence`。

```text
input-streaming -> ready -> approval-required? -> running? -> completed | failed
```

`tool-input-available` 表示输入已经完整，因此状态是 `ready`，不能直接等同于 `running`。

## 3. 磁盘布局

```text
messages/
├── messages.jsonl
├── assistant_message.json
└── meta.json
```

### 3.1 messages.jsonl

每一行都是完整 `SessionMessage`，不包含 Mutation envelope。

```json
{"message_id":"user:1","type":"user","sequence":1,"revision":1,"parts":[]}
{"message_id":"assistant:1","type":"assistant","sequence":2,"revision":8,"status":"completed","parts":[]}
```

写入规则：

- User、Error 和完成后的 Assistant 通常只追加一次。
- Action 状态变化追加相同 `message_id`、相同 `sequence`、更高 `revision` 的完整快照。
- 读取时按 `message_id` 选择最大 `revision`，再按 `sequence` 排序。
- `part` 和 `delta` Mutation 永远不能写入该文件。

### 3.2 assistant_message.json

该文件只保存当前唯一的 streaming Assistant Message 完整快照。

写入规则：

- 创建 Assistant 时写入 revision 1 草稿。
- 每次 Part 或 Delta 更新后，先更新完整 Message，再通过临时文件加 rename 原子覆盖。
- 同一时刻只允许存在一个草稿。
- 更新必须匹配当前草稿的 `message_id`，且 revision 严格加一。
- 完成时先把最终 Message 追加到 `messages.jsonl`，再删除草稿。

进程重启时如果发现草稿，Recorder 将其收口为 `status: "stopped"`，保留全部已有 Parts，并追加到历史。

## 4. 实时 Mutation

Mutation 仅是 EventHub 的实时传输协议，不是持久化协议。

```ts
type SessionMutation =
  | {
      variant: "message";
      type: "user" | "assistant" | "action" | "error";
      message: SessionMessage;
    }
  | {
      variant: "part";
      type: "text" | "reasoning" | "tool" | "file" | "data";
      message_id: string;
      part: SessionAssistantMessagePart;
    }
  | {
      variant: "delta";
      type: "text" | "reasoning";
      message_id: string;
      part_id: string;
      delta: string;
    }
  | {
      variant: "turn";
      type: "start" | "finish";
      turn_id: string;
      status: "running" | "completed" | "failed" | "stopped";
    }
  | {
      variant: "session";
      type: "title";
      title: string;
    };
```

所有 Mutation 都包含 `mutation_id`、`session_id` 和 `created_at`。Message 相关 Mutation 还包含目标 Message 的 `message_id` 和应用后的 `revision`。不再包含 `commit_sequence`。

`message | part | delta` 描述 Message 状态；`turn` 描述执行生命周期；`session` 描述 Session 自身状态。五类变化只通过一个 `session.subscribe()` 对外发布。

发布顺序固定为：

```text
更新内存 Message
-> 持久化完整 Message 或 Assistant 草稿
-> 发布 Mutation
```

只有持久化成功的变化才能发布。订阅者失败不能回滚已经完成的持久化，也不能阻断其他订阅者。

Turn 生命周期不写入 Message 历史；Session 状态先写入自身 metadata，再发布 Mutation。Mutation envelope 本身均不持久化。

## 5. 调用逻辑

### 5.1 User Message

```ts
await recorder.append_user_message({
  turn_id,
  input_type: "prompt",
  parts,
});
```

Recorder 分配 `message_id`、`sequence` 和 revision 1，将完整 User Message 追加到 `messages.jsonl`，然后发布 `variant: "message"`。

### 5.2 Assistant 流式消息

```ts
const writer = await recorder.open_assistant_message({
  turn_id,
  segment_index: 1,
});

for await (const chunk of stream) {
  await writer.apply_chunk(chunk);
}

await writer.complete();
```

处理顺序：

```text
open
-> 写 assistant_message.json
-> 发布 message

text-start
-> 创建带固定 sequence 的 text Part
-> 覆盖 assistant_message.json
-> 发布 part

text-delta
-> 把 delta 合并进该 text Part
-> 覆盖 assistant_message.json
-> 发布 delta

tool-input-start
-> 在当前位置创建 tool Part

tool 后续状态
-> 按 tool_call_id 更新同一个 Part
-> 保持 part_id 和 sequence 不变

complete
-> 直接从当前草稿生成最终 Assistant
-> 追加 messages.jsonl
-> 删除 assistant_message.json
-> 发布最终 message
```

最终 Assistant 禁止根据另一个 `result.assistantMessage.parts` 重新组装，否则 Tool Part 可能被移动到末尾。

### 5.3 Action Message

```ts
const action = await recorder.open_action_message({
  action_type: "compact",
  title: "Compacting",
});

await action.complete({ title: "Compacted" });
```

Action 创建和更新都追加完整快照。更新必须复用 `message_id` 和 `sequence`，并递增 `revision`。

### 5.4 Error Message

```ts
await recorder.append_error_message({
  scope: "turn",
  turn_id,
  code: "turn_execution_failed",
  message: error.message,
  recoverable: true,
});
```

Error 是顶层 Message，直接追加完整快照并发布 Message Mutation。

## 6. 读取与重连

历史读取只使用：

```ts
const page = await session.messages({ limit: 100 });
```

返回结果包含已完成历史；执行期间也包含当前 Assistant 草稿。分页按 Message `sequence` 进行。

实时订阅：

```ts
const unsubscribe = session.subscribe((mutation) => {
  apply_mutation(mutation);
});
```

断线重连流程：

1. 建立新订阅并暂存随后到达的 Mutation。
2. 调用 `session.messages()` 读取完整快照。
3. 用 `message_id + revision` 合并暂存 Mutation。
4. 开始正常消费实时事件。

不再通过 `message_changes` 或持久化 Mutation 日志恢复。

## 7. Tool 审批

审批归属触发工具调用的具体 Session。Tool Part 使用同一个 `part_id` 和 `sequence` 原地推进：

```text
ready -> approval-required -> running | failed
```

实时客户端从 Tool Part Mutation 读取完整审批快照，并通过 Session 命令提交决定：

```ts
session.subscribe((mutation) => {
  if (
    mutation.variant === "part" &&
    mutation.type === "tool" &&
    mutation.part.state === "approval-required" &&
    mutation.part.approval
  ) {
    show_approval_request(mutation.part.approval);
  }
});

await session.resolve_approval({
  approval_id,
  decision: "approved",
});
```

非实时客户端可以先通过 `session.approvals()` 查询，再使用 `session.resolve_approval({ approval_id, decision })`。审批模式也由 Session 暴露：`approval_mode()` 与 `set_approval_mode()`。

## 8. 一致性约束

- Session 内 Message `sequence` 唯一且创建后不可变。
- Assistant 内 Part `sequence` 唯一且创建后不可变。
- 同一 Message 的 revision 单调递增。
- 同一时刻最多存在一个 streaming Assistant 草稿。
- EventHub 发布永远晚于对应持久化。
- 最终 Assistant 必须直接由当前草稿收口。
- JSONL 每一行必须是完整 Message，不允许出现 `variant` 字段。
- Approval 必须校验归属 Session，不能处理其他 Session 的请求。
- 审批详情必须随 `approval-required` Tool Part 一起发布，订阅端不做二次查询。
- `subscribe()` 只传输事实，`resolve_approval()` 只提交命令，两者职责不混合。

## 9. 验收标准

- 每个 Delta 都能被前端立即收到。
- Delta 期间 `messages.jsonl` 不增长，`assistant_message.json` 内容持续更新。
- Assistant 完成后草稿文件消失，历史只新增一条完整 Assistant。
- `text -> tool -> text` 在实时、草稿、完成历史和重启恢复后顺序完全一致。
- Tool 从输入、审批到输出始终更新同一个 Part。
- 本地与远程 Session 只暴露一个 `subscribe()`，并收到相同五类 Mutation。
- 本地与远程 `resolve_approval()` 对同一审批产生一致结果。
- Action 多 revision 读取时只返回最新快照。
- 重启可把未完成 Assistant 收口为 `stopped`，不丢失已有内容。
