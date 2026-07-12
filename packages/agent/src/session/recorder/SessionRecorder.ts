/**
 * SessionRecorder：Session Message 的唯一持久化与发布入口。
 *
 * Mutation 先写入单一 messages.jsonl，成功后更新内存 snapshot，最后发布同一个对象。
 */

import type { UIMessage, UIMessageChunk } from "ai";
import { generateId } from "@/utils/Id.js";
import { JsonlSessionMessageStore } from "@/session/recorder/JsonlSessionMessageStore.js";
import { reduce_session_message } from "@/session/recorder/SessionMessageReducer.js";
import type { JsonObject, JsonValue } from "@/types/common/Json.js";
import type {
  ListSessionMessagesInput,
  SessionActionMessage,
  SessionAssistantMessage,
  SessionAssistantMessagePart,
  SessionAssistantToolPart,
  SessionErrorMessage,
  SessionMessage,
  SessionMessagePage,
  SessionUserMessage,
  SessionUserMessagePart,
} from "@/types/session/SessionMessage.js";
import type {
  ListSessionMessageChangesInput,
  SessionMessageMutation,
  SessionMessageMutationPage,
  SessionMessageMutationSubscriber,
  SessionMessageMutationUnsubscribe,
} from "@/types/session/SessionMessageMutation.js";

/** SessionRecorder 构造参数。 */
export interface SessionRecorderOptions {
  /** 当前 Session 标识。 */
  session_id: string;
  /** 单一 JSONL Mutation store。 */
  store: JsonlSessionMessageStore;
  /** Mutation 成功提交后的发布函数。 */
  publish: (mutation: SessionMessageMutation) => void;
}

/** User Message 创建参数。 */
export interface AppendSessionUserMessageInput {
  /** 当前输入所属 turn。 */
  turn_id: string;
  /** 普通 prompt 或 steering 输入。 */
  input_type: "prompt" | "steer";
  /** User 结构化 parts。 */
  parts: SessionUserMessagePart[];
  /** 可选指定 Message ID，通常由 Recorder 生成。 */
  message_id?: string;
  /** 默认展示范围。 */
  visibility?: "visible" | "internal";
}

/** Assistant Message 创建参数。 */
export interface OpenSessionAssistantMessageInput {
  /** 当前 assistant 所属 turn。 */
  turn_id: string;
  /** 当前 assistant 在 turn 内的 segment 序号。 */
  segment_index: number;
  /** 普通 assistant 或 compact summary。 */
  message_type?: "normal" | "summary";
  /** 默认展示范围。 */
  visibility?: "visible" | "internal";
  /** 可选指定 Message ID。 */
  message_id?: string;
  /** Summary 已覆盖到的来源 Message。 */
  summary_through_message_id?: string;
}

/** 已完成 Assistant Message 直接写入参数。 */
export interface AppendCompletedAssistantMessageInput {
  /** Assistant 所属 turn。 */
  turn_id?: string;
  /** Assistant 完整 parts。 */
  parts: SessionAssistantMessagePart[];
  /** 普通 assistant 或 compact summary。 */
  message_type?: "normal" | "summary";
  /** 默认展示范围。 */
  visibility?: "visible" | "internal";
  /** Summary 已覆盖到的来源 Message。 */
  summary_through_message_id?: string;
}

/** Action Message 创建参数。 */
export interface OpenSessionActionMessageInput {
  /** 可选稳定 Message ID；业务 action 生命周期使用该值定位。 */
  message_id?: string;
  /** Action 所属 turn。 */
  turn_id?: string;
  /** Action 业务类型。 */
  action_type: string;
  /** Action 标题。 */
  title: string;
  /** Action 描述。 */
  description?: string;
  /** Action 附加数据。 */
  data?: JsonObject;
}

/** Error Message 创建参数。 */
export interface AppendSessionErrorMessageInput {
  /** 错误影响范围。 */
  scope: "session" | "turn";
  /** 错误所属 turn。 */
  turn_id?: string;
  /** 稳定错误码。 */
  code: string;
  /** 用户可见错误文本。 */
  message: string;
  /** 是否允许恢复。 */
  recoverable: boolean;
}

/** 唯一 Session Message 写入服务。 */
export class SessionRecorder {
  readonly session_id: string;
  private readonly store: JsonlSessionMessageStore;
  private readonly publish: SessionRecorderOptions["publish"];
  private readonly subscribers = new Set<SessionMessageMutationSubscriber>();
  private readonly messages_by_id = new Map<string, SessionMessage>();
  private initialized = false;

  constructor(options: SessionRecorderOptions) {
    this.session_id = String(options.session_id || "").trim();
    this.store = options.store;
    this.publish = options.publish;
    if (!this.session_id) throw new Error("SessionRecorder requires session_id");
  }

  /** 重放已有 Mutation，并收口进程中断遗留的运行状态。 */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.store.initialize();
    for (const message of await this.store.list_messages()) {
      this.messages_by_id.set(message.message_id, message);
    }
    this.initialized = true;
    const unfinished = [...this.messages_by_id.values()];
    for (const message of unfinished) {
      if (message.type === "assistant" && message.status === "streaming") {
        await this.complete_assistant_message(message.message_id, "stopped");
      }
      if (message.type === "action" && message.status === "running") {
        await this.update_action_message(message.message_id, "failed", {
          description: message.description || "Action interrupted before completion.",
        });
      }
    }
  }

  /** 同步读取当前内存 Message。 */
  get_message(message_id: string): SessionMessage | undefined {
    return this.messages_by_id.get(message_id);
  }

  /** 追加普通 prompt 或 steering User Message。 */
  async append_user_message(
    input: AppendSessionUserMessageInput,
  ): Promise<SessionUserMessage> {
    const message = await this.create_message((sequence, created_at) => ({
      message_id:
        String(input.message_id || "").trim() ||
        `user:${this.session_id}:${generateId()}`,
      session_id: this.session_id,
      turn_id: input.turn_id,
      sequence,
      revision: 1,
      visibility: input.visibility || "visible",
      created_at,
      updated_at: created_at,
      type: "user",
      input_type: input.input_type,
      parts: structuredClone(input.parts),
    }));
    return message as SessionUserMessage;
  }

  /** 创建可持续接收 chunk 的 Assistant segment。 */
  async open_assistant_message(
    input: OpenSessionAssistantMessageInput,
  ): Promise<SessionAssistantMessageWriter> {
    const message = (await this.create_message((sequence, created_at) => ({
      message_id:
        String(input.message_id || "").trim() ||
        `assistant:${this.session_id}:${generateId()}`,
      session_id: this.session_id,
      turn_id: input.turn_id,
      sequence,
      revision: 1,
      visibility: input.visibility || "visible",
      created_at,
      updated_at: created_at,
      type: "assistant",
      message_type: input.message_type || "normal",
      segment_index: input.segment_index,
      status: "streaming",
      parts: [],
      ...(input.summary_through_message_id
        ? { summary_through_message_id: input.summary_through_message_id }
        : {}),
    }))) as SessionAssistantMessage;
    return new SessionAssistantMessageWriter(this, message.message_id);
  }

  /** 直接写入一条已完成 Assistant Message。 */
  async append_completed_assistant_message(
    input: AppendCompletedAssistantMessageInput,
  ): Promise<SessionAssistantMessage> {
    const turn_id = input.turn_id || `external:${this.session_id}:${generateId()}`;
    const writer = await this.open_assistant_message({
      turn_id,
      segment_index: 1,
      message_type: input.message_type || "normal",
      visibility: input.visibility || "visible",
      ...(input.summary_through_message_id
        ? { summary_through_message_id: input.summary_through_message_id }
        : {}),
    });
    for (const part of input.parts) await writer.upsert_part(part);
    await writer.complete();
    return this.get_message(writer.message_id) as SessionAssistantMessage;
  }

  /** 创建 running Action Message。 */
  async open_action_message(
    input: OpenSessionActionMessageInput,
  ): Promise<SessionActionMessageWriter> {
    const message = (await this.create_message((sequence, created_at) => ({
      message_id:
        String(input.message_id || "").trim() ||
        `action:${this.session_id}:${generateId()}`,
      session_id: this.session_id,
      ...(input.turn_id ? { turn_id: input.turn_id } : {}),
      sequence,
      revision: 1,
      visibility: "visible",
      created_at,
      updated_at: created_at,
      type: "action",
      action_type: input.action_type,
      status: "running",
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      ...(input.data ? { data: structuredClone(input.data) } : {}),
    }))) as SessionActionMessage;
    return new SessionActionMessageWriter(this, message.message_id);
  }

  /** 更新 Action 状态，同时保持 message_id 与 sequence 不变。 */
  async update_action_message(
    message_id: string,
    status: "running" | "completed" | "failed",
    changes?: { title?: string; description?: string; data?: JsonObject },
  ): Promise<SessionActionMessage> {
    const mutation = await this.store.commit((state) => {
      const current = require_message(state.messages, message_id, "action");
      const created_at = Date.now();
      const message: SessionActionMessage = {
        ...current,
        status,
        ...(changes?.title ? { title: changes.title } : {}),
        ...(changes?.description !== undefined
          ? { description: changes.description }
          : {}),
        ...(changes?.data ? { data: structuredClone(changes.data) } : {}),
        revision: current.revision + 1,
        updated_at: created_at,
      };
      return this.build_mutation(state.commit_sequence, message, {
        type: "message-updated",
        message,
      });
    });
    this.accept_mutation(mutation);
    return this.get_message(message_id) as SessionActionMessage;
  }

  /** 创建用户可见 Error Message。 */
  async append_error_message(
    input: AppendSessionErrorMessageInput,
  ): Promise<SessionErrorMessage> {
    return (await this.create_message((sequence, created_at) => ({
      message_id: `error:${this.session_id}:${generateId()}`,
      session_id: this.session_id,
      ...(input.turn_id ? { turn_id: input.turn_id } : {}),
      sequence,
      revision: 1,
      visibility: "visible",
      created_at,
      updated_at: created_at,
      type: "error",
      scope: input.scope,
      code: input.code,
      message: input.message,
      recoverable: input.recoverable,
    }))) as SessionErrorMessage;
  }

  /** 读取折叠后的 Message snapshot。 */
  async list_messages(
    input?: ListSessionMessagesInput,
  ): Promise<SessionMessagePage> {
    await this.ensure_initialized();
    const mutations = await this.store.list_mutations();
    const latest_commit_sequence =
      mutations[mutations.length - 1]?.commit_sequence || 0;
    const include_internal = input?.include_internal === true;
    const through_sequence = Number.isFinite(input?.through_sequence)
      ? Number(input?.through_sequence)
      : Number.POSITIVE_INFINITY;
    const before_sequence = Number.isFinite(input?.before_sequence)
      ? Number(input?.before_sequence)
      : Number.POSITIVE_INFINITY;
    const all = [...this.messages_by_id.values()]
      .filter(
        (message) =>
          (include_internal || message.visibility === "visible") &&
          message.sequence <= through_sequence &&
          message.sequence < before_sequence,
      )
      .sort((left, right) => left.sequence - right.sequence);
    const offset = decode_cursor(input?.cursor);
    const limit = normalize_limit(input?.limit, 100, 500);
    const items = all.slice(offset, offset + limit).map((item) => structuredClone(item));
    const next_offset = offset + items.length;
    return {
      items,
      total: all.length,
      ...(next_offset < all.length ? { next_cursor: encode_cursor(next_offset) } : {}),
      has_more: next_offset < all.length,
      latest_commit_sequence,
    };
  }

  /** 从指定 commit_sequence 增量读取 Mutation。 */
  async list_message_changes(
    input: ListSessionMessageChangesInput,
  ): Promise<SessionMessageMutationPage> {
    await this.ensure_initialized();
    const after = Math.max(0, Math.floor(input.after_commit_sequence || 0));
    const limit = normalize_limit(input.limit, 200, 1000);
    const all = await this.store.list_mutations();
    const matching = all.filter((item) => item.commit_sequence > after);
    const items = matching.slice(0, limit);
    const latest_commit_sequence = all[all.length - 1]?.commit_sequence || 0;
    return {
      items,
      has_more: matching.length > items.length,
      next_commit_sequence:
        items[items.length - 1]?.commit_sequence || after,
      latest_commit_sequence,
    };
  }

  /** 订阅已成功持久化的未来 Mutation。 */
  subscribe(
    subscriber: SessionMessageMutationSubscriber,
  ): SessionMessageMutationUnsubscribe {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  /** 向当前 Session 导入 fork 来源 Message，并重新分配全部身份和顺序。 */
  async import_messages(messages: SessionMessage[]): Promise<void> {
    const turn_ids = new Map<string, string>();
    const message_ids = new Map<string, string>();
    for (const source of [...messages].sort((a, b) => a.sequence - b.sequence)) {
      const turn_id = source.turn_id
        ? resolve_import_id(turn_ids, source.turn_id, "turn")
        : undefined;
      const message_id = resolve_import_id(
        message_ids,
        source.message_id,
        source.type,
      );
      await this.create_message((sequence, created_at) => ({
        ...structuredClone(source),
        message_id,
        session_id: this.session_id,
        ...(turn_id ? { turn_id } : {}),
        sequence,
        revision: 1,
        created_at,
        updated_at: created_at,
        origin: {
          session_id: source.session_id,
          message_id: source.message_id,
          ...(source.turn_id ? { turn_id: source.turn_id } : {}),
        },
      }));
    }
  }

  /** @internal 写入 Assistant 原始文本 delta。 */
  async append_assistant_delta(
    message_id: string,
    part_id: string,
    part_type: "text" | "reasoning",
    delta: string,
  ): Promise<void> {
    if (!delta) return;
    const mutation = await this.store.commit((state) => {
      const current = require_message(state.messages, message_id, "assistant");
      return {
        mutation_id: generateId(),
        type: "assistant-part-delta",
        commit_sequence: state.commit_sequence,
        message_id,
        sequence: current.sequence,
        revision: current.revision + 1,
        session_id: this.session_id,
        turn_id: current.turn_id,
        created_at: Date.now(),
        part_id,
        part_type,
        delta,
      };
    });
    this.accept_mutation(mutation);
  }

  /** @internal 写入 Assistant 完整 part。 */
  async update_assistant_part(
    message_id: string,
    part: SessionAssistantMessagePart,
  ): Promise<void> {
    const mutation = await this.store.commit((state) => {
      const current = require_message(state.messages, message_id, "assistant");
      return {
        mutation_id: generateId(),
        type: "assistant-part-updated",
        commit_sequence: state.commit_sequence,
        message_id,
        sequence: current.sequence,
        revision: current.revision + 1,
        session_id: this.session_id,
        turn_id: current.turn_id,
        created_at: Date.now(),
        part: structuredClone(part),
      };
    });
    this.accept_mutation(mutation);
  }

  /** @internal 收口 Assistant Message。 */
  async complete_assistant_message(
    message_id: string,
    status: "completed" | "stopped" | "failed",
  ): Promise<void> {
    const mutation = await this.store.commit((state) => {
      const current = require_message(state.messages, message_id, "assistant");
      return {
        mutation_id: generateId(),
        type: "message-completed",
        commit_sequence: state.commit_sequence,
        message_id,
        sequence: current.sequence,
        revision: current.revision + 1,
        session_id: this.session_id,
        turn_id: current.turn_id,
        created_at: Date.now(),
        status,
      };
    });
    this.accept_mutation(mutation);
  }

  private async create_message(
    factory: (sequence: number, created_at: number) => SessionMessage,
  ): Promise<SessionMessage> {
    const mutation = await this.store.commit((state) => {
      const message = factory(state.message_sequence, Date.now());
      return this.build_mutation(state.commit_sequence, message, {
        type: "message-created",
        message,
      });
    });
    this.accept_mutation(mutation);
    return (mutation as Extract<SessionMessageMutation, { type: "message-created" }>).message;
  }

  private build_mutation<TPayload extends object>(
    commit_sequence: number,
    message: SessionMessage,
    payload: TPayload,
  ): SessionMessageMutation {
    return {
      mutation_id: generateId(),
      commit_sequence,
      message_id: message.message_id,
      sequence: message.sequence,
      revision: message.revision,
      session_id: this.session_id,
      ...(message.turn_id ? { turn_id: message.turn_id } : {}),
      created_at: message.updated_at,
      ...payload,
    } as unknown as SessionMessageMutation;
  }

  private accept_mutation(mutation: SessionMessageMutation): void {
    const current = this.messages_by_id.get(mutation.message_id);
    const next = reduce_session_message(current, mutation);
    this.messages_by_id.set(next.message_id, next);
    this.publish(mutation);
    for (const subscriber of this.subscribers) {
      try {
        subscriber(mutation);
      } catch {
        // 单个订阅者异常不能影响已经完成的提交。
      }
    }
  }

  private async ensure_initialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }
}

/** 单个 Assistant segment 的流式 writer。 */
export class SessionAssistantMessageWriter {
  readonly message_id: string;
  private readonly recorder: SessionRecorder;
  private closed = false;

  constructor(recorder: SessionRecorder, message_id: string) {
    this.recorder = recorder;
    this.message_id = message_id;
  }

  /** 应用一个原始 AI SDK UI chunk。 */
  async apply_chunk(chunk: UIMessageChunk): Promise<void> {
    if (this.closed) throw new Error("Assistant Message writer is closed");
    const current = this.current_message();
    switch (chunk.type) {
      case "text-start":
      case "reasoning-start":
        await this.upsert_part({
          part_id: `${chunk.type === "text-start" ? "text" : "reasoning"}:${chunk.id}`,
          type: chunk.type === "text-start" ? "text" : "reasoning",
          text: "",
          state: "streaming",
        });
        return;
      case "text-delta":
      case "reasoning-delta":
        await this.recorder.append_assistant_delta(
          this.message_id,
          `${chunk.type === "text-delta" ? "text" : "reasoning"}:${chunk.id}`,
          chunk.type === "text-delta" ? "text" : "reasoning",
          chunk.delta,
        );
        return;
      case "text-end":
      case "reasoning-end": {
        const part_id = `${chunk.type === "text-end" ? "text" : "reasoning"}:${chunk.id}`;
        const part = current.parts.find((item) => item.part_id === part_id);
        if (part?.type === "text" || part?.type === "reasoning") {
          await this.upsert_part({ ...part, state: "done" });
        }
        return;
      }
      case "tool-input-start":
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: chunk.toolName,
          state: "input-streaming",
          input_text: "",
        });
        return;
      case "tool-input-delta": {
        const tool = this.find_tool(chunk.toolCallId);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "input-streaming",
          input_text: `${tool?.input_text || ""}${chunk.inputTextDelta}`,
        });
        return;
      }
      case "tool-input-available":
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: chunk.toolName,
          state: "running",
          input: to_json_value(chunk.input),
        });
        return;
      case "tool-input-error":
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: chunk.toolName,
          state: "failed",
          input: to_json_value(chunk.input),
          error: chunk.errorText,
        });
        return;
      case "tool-approval-request": {
        const tool = this.find_tool(chunk.toolCallId);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "approval-required",
          approval_id: chunk.approvalId,
        });
        return;
      }
      case "tool-output-available": {
        const tool = this.find_tool(chunk.toolCallId);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "completed",
          output: to_json_value(chunk.output),
        });
        return;
      }
      case "tool-output-error":
      case "tool-output-denied": {
        const tool = this.find_tool(chunk.toolCallId);
        await this.upsert_tool(chunk.toolCallId, {
          tool_name: tool?.tool_name || "unknown",
          state: "failed",
          error:
            chunk.type === "tool-output-error"
              ? chunk.errorText
              : "Tool output denied",
        });
        return;
      }
      case "file":
        await this.upsert_part({
          part_id: `file:${generateId()}`,
          type: "file",
          media_type: chunk.mediaType,
          url: chunk.url,
        });
        return;
      default:
        return;
    }
  }

  /** 写入一个完整 Assistant part。 */
  async upsert_part(part: SessionAssistantMessagePart): Promise<void> {
    await this.recorder.update_assistant_part(this.message_id, part);
  }

  /** 当前实现逐 chunk 等待落盘，因此 flush 在返回时天然完成。 */
  async flush(): Promise<void> {}

  /** 正常完成当前 assistant segment。 */
  async complete(): Promise<void> {
    await this.close("completed");
  }

  /** 停止当前 assistant segment，并保留已有 parts。 */
  async stop(): Promise<void> {
    await this.close("stopped");
  }

  /** 以失败状态关闭当前 assistant segment。 */
  async fail(_error: unknown): Promise<void> {
    await this.close("failed");
  }

  private current_message(): SessionAssistantMessage {
    const message = this.recorder.get_message(this.message_id);
    if (!message || message.type !== "assistant") {
      throw new Error(`Assistant Message not found: ${this.message_id}`);
    }
    return message;
  }

  private find_tool(tool_call_id: string): SessionAssistantToolPart | undefined {
    return this.current_message().parts.find(
      (part): part is SessionAssistantToolPart =>
        part.type === "tool" && part.tool_call_id === tool_call_id,
    );
  }

  private async upsert_tool(
    tool_call_id: string,
    changes: Pick<SessionAssistantToolPart, "tool_name" | "state"> &
      Partial<Omit<SessionAssistantToolPart, "part_id" | "type" | "tool_call_id" | "tool_name" | "state">>,
  ): Promise<void> {
    const current = this.find_tool(tool_call_id);
    await this.upsert_part({
      ...(current || {}),
      part_id: `tool:${tool_call_id}`,
      type: "tool",
      tool_call_id,
      ...changes,
    });
  }

  private async close(status: "completed" | "stopped" | "failed"): Promise<void> {
    if (this.closed) return;
    await this.recorder.complete_assistant_message(this.message_id, status);
    this.closed = true;
  }
}

/** 单个 Action Message 的生命周期 writer。 */
export class SessionActionMessageWriter {
  readonly message_id: string;
  private readonly recorder: SessionRecorder;
  private closed = false;

  constructor(recorder: SessionRecorder, message_id: string) {
    this.recorder = recorder;
    this.message_id = message_id;
  }

  /** 把 Action 更新为 completed。 */
  async complete(input?: { title?: string; description?: string; data?: JsonObject }): Promise<void> {
    if (this.closed) return;
    await this.recorder.update_action_message(this.message_id, "completed", input);
    this.closed = true;
  }

  /** 把 Action 更新为 failed。 */
  async fail(error: unknown): Promise<void> {
    if (this.closed) return;
    await this.recorder.update_action_message(this.message_id, "failed", {
      description: error instanceof Error ? error.message : String(error),
    });
    this.closed = true;
  }
}

/** 把 AI SDK User parts 归一为 canonical User parts。 */
export function normalize_session_user_parts(
  parts: UIMessage["parts"] | null | undefined,
): SessionUserMessagePart[] {
  if (!Array.isArray(parts)) return [];
  return parts.flatMap<SessionUserMessagePart>((part, index) => {
    if (!part || typeof part !== "object") return [];
    const candidate = part as Record<string, unknown>;
    if (candidate.type === "text") {
      return [{
        part_id: `user-text:${index + 1}`,
        type: "text",
        text: String(candidate.text || ""),
        state: "done",
      }];
    }
    if (candidate.type === "file") {
      return [{
        part_id: `user-file:${index + 1}`,
        type: "file",
        url: String(candidate.url || ""),
        media_type: String(candidate.mediaType || "application/octet-stream"),
        ...(candidate.filename ? { filename: String(candidate.filename) } : {}),
      }];
    }
    if (String(candidate.type || "").startsWith("data-")) {
      return [{
        part_id: `user-data:${index + 1}`,
        type: "data",
        data_type: String(candidate.type),
        data: to_json_value(candidate.data),
      }];
    }
    return [];
  });
}

function require_message<TType extends SessionMessage["type"]>(
  messages: SessionMessage[],
  message_id: string,
  type: TType,
): Extract<SessionMessage, { type: TType }> {
  const message = messages.find((item) => item.message_id === message_id);
  if (!message || message.type !== type) {
    throw new Error(`Session ${type} Message not found: ${message_id}`);
  }
  return message as Extract<SessionMessage, { type: TType }>;
}

function to_json_value(input: unknown): JsonValue {
  if (input === undefined || input === null) return null;
  if (typeof input === "string" || typeof input === "number" || typeof input === "boolean") return input;
  try {
    return JSON.parse(JSON.stringify(input)) as JsonValue;
  } catch {
    return String(input);
  }
}

function normalize_limit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(Number(value))));
}

function encode_cursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decode_cursor(cursor: string | undefined): number {
  const value = String(cursor || "").trim();
  if (!value) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { offset?: unknown };
    return typeof parsed.offset === "number" && parsed.offset >= 0
      ? Math.floor(parsed.offset)
      : 0;
  } catch {
    throw new Error("Invalid Session Message cursor");
  }
}

function resolve_import_id(map: Map<string, string>, source_id: string, prefix: string): string {
  const existing = map.get(source_id);
  if (existing) return existing;
  const created = `${prefix}:${generateId()}`;
  map.set(source_id, created);
  return created;
}
