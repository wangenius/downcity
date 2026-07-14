/**
 * SessionRecorder：Session Message 的唯一持久化与发布入口。
 *
 * 完整 Message 与 Assistant 草稿先持久化，成功后再发布实时 Mutation。
 */

import type { UIMessage } from "ai";
import { generateId } from "@/utils/Id.js";
import { SessionAssistantMessageWriter } from "@/session/recorder/SessionAssistantMessageWriter.js";
import { to_session_json_value } from "@/session/recorder/SessionJsonValue.js";
import { JsonlSessionMessageStore } from "@/session/recorder/JsonlSessionMessageStore.js";
import type { JsonObject } from "@/types/common/Json.js";
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
  SessionMutation,
  SessionMessageMutation as SessionMessageSnapshotMutation,
} from "@/types/session/SessionMutation.js";
import type {
  SessionContextSnapshot,
  SessionMessageStorageStats,
  SessionSegmentSummary,
} from "@/types/session/SessionSegment.js";
import type { SessionStreamingToolLocation } from "@/types/session/SessionToolRuntime.js";

export { SessionAssistantMessageWriter } from "@/session/recorder/SessionAssistantMessageWriter.js";

/** SessionRecorder 构造参数。 */
export interface SessionRecorderOptions {
  /** 当前 Session 标识。 */
  session_id: string;
  /** Message 快照 store。 */
  store: JsonlSessionMessageStore;
  /** 持久化成功后的实时 Mutation 发布函数。 */
  publish: (mutation: SessionMutation) => void;
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
  kind?: "normal" | "summary";
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
  kind?: "normal" | "summary";
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
  private readonly messages_by_id = new Map<string, SessionMessage>();
  private initialized = false;

  constructor(options: SessionRecorderOptions) {
    this.session_id = String(options.session_id || "").trim();
    this.store = options.store;
    this.publish = options.publish;
    if (!this.session_id) throw new Error("SessionRecorder requires session_id");
  }

  /** 恢复已有 Message，并收口进程中断遗留的运行状态。 */
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
      kind: input.kind || "normal",
      segment_index: input.segment_index,
      status: "streaming",
      parts: [],
      ...(input.summary_through_message_id
        ? { summary_through_message_id: input.summary_through_message_id }
        : {}),
    }), true)) as SessionAssistantMessage;
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
      kind: input.kind || "normal",
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
    const message = await this.store.append_message((state) => {
      const current = require_message(state.messages, message_id, "action");
      const created_at = Date.now();
      return {
        ...current,
        status,
        ...(changes?.title ? { title: changes.title } : {}),
        ...(changes?.description !== undefined
          ? { description: changes.description }
          : {}),
        ...(changes?.data ? { data: structuredClone(changes.data) } : {}),
        revision: current.revision + 1,
        updated_at: created_at,
      } satisfies SessionActionMessage;
    });
    this.accept_message(message);
    return message as SessionActionMessage;
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

  /** 读取 Active 或指定边界之前最近的完整 Segment。 */
  async list_messages(
    input?: ListSessionMessagesInput,
  ): Promise<SessionMessagePage> {
    await this.ensure_initialized();
    const requests_segment = input?.before_sequence !== undefined;
    const before_sequence = input?.before_sequence;
    if (
      requests_segment &&
      (!Number.isInteger(before_sequence) || Number(before_sequence) <= 0)
    ) {
      throw new Error("before_sequence must be a positive integer");
    }
    const segment = requests_segment
      ? await this.store.read_segment_before(Number(before_sequence))
      : null;
    const source = requests_segment ? "segment" as const : "active" as const;
    const messages = requests_segment
      ? segment?.messages || []
      : [...this.messages_by_id.values()].sort(compare_message_sequence);
    const start_sequence = messages[0]?.sequence;
    const end_sequence = messages.at(-1)?.sequence;
    const history_boundary = source === "segment"
      ? segment?.range.start_sequence
      : await this.store.active_before_sequence(messages);
    const has_more = history_boundary !== undefined &&
      await this.store.has_segment_before(history_boundary);
    const stats = await this.store.stats();
    const items = messages
      .filter((message) => input?.include_internal === true || message.visibility === "visible")
      .map((message) => structuredClone(message));
    return {
      items,
      total: stats.message_count,
      source,
      ...(start_sequence !== undefined ? { start_sequence } : {}),
      ...(end_sequence !== undefined ? { end_sequence } : {}),
      ...(has_more && history_boundary !== undefined
        ? { next_before_sequence: history_boundary }
        : {}),
      has_more,
    };
  }

  /** 读取最新累计 Summary 与全部 Active Message，供模型上下文使用。 */
  async context_snapshot(): Promise<SessionContextSnapshot> {
    await this.ensure_initialized();
    return {
      summary: await this.store.read_latest_summary(),
      messages: [...this.messages_by_id.values()]
        .sort(compare_message_sequence)
        .map((message) => structuredClone(message)),
    };
  }

  /** 读取全部真实历史，供 Fork 等明确的全量复制操作使用。 */
  async list_history_messages(): Promise<SessionMessage[]> {
    await this.ensure_initialized();
    return await this.store.list_history_messages();
  }

  /** 读取当前 Session 的存储统计。 */
  async storage_stats(): Promise<SessionMessageStorageStats> {
    await this.ensure_initialized();
    return await this.store.stats();
  }

  /** 把 Active 前缀和累计 Summary 提交为不可变 Segment。 */
  async compact_active(input: {
    /** 移入 Segment 的最后一条真实 Message sequence。 */
    through_sequence: number;
    /** 写入 Segment footer 的累计 Summary。 */
    summary: SessionSegmentSummary;
  }): Promise<void> {
    await this.ensure_initialized();
    const result = await this.store.compact_active(input);
    this.messages_by_id.clear();
    for (const message of result.active_messages) {
      this.messages_by_id.set(message.message_id, structuredClone(message));
    }
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
    type: "text" | "reasoning",
    delta: string,
  ): Promise<void> {
    if (!delta) return;
    const current = require_message([...this.messages_by_id.values()], message_id, "assistant");
    require_streaming_assistant(current);
    const part = current.parts.find((item) => item.part_id === part_id);
    if (!part || (part.type !== "text" && part.type !== "reasoning")) {
      throw new Error(`Delta target Part does not exist: ${part_id}`);
    }
    if (part.type !== type) throw new Error(`Delta type changed for Part: ${part_id}`);
    const created_at = Date.now();
    const message: SessionAssistantMessage = {
      ...current,
      revision: current.revision + 1,
      updated_at: created_at,
      parts: current.parts.map((item) =>
        item.part_id === part_id && (item.type === "text" || item.type === "reasoning")
          ? { ...item, text: item.text + delta }
          : item,
      ),
    };
    await this.store.write_assistant_message(message);
    this.accept_mutation({
      mutation_id: generateId(),
      variant: "delta",
      type,
      message_id,
      revision: message.revision,
      session_id: this.session_id,
      turn_id: message.turn_id,
      created_at,
      part_id,
      delta,
    }, message);
  }

  /** @internal 写入 Assistant 完整 part。 */
  async update_assistant_part(
    message_id: string,
    part: SessionAssistantMessagePart,
  ): Promise<void> {
    const current = require_message([...this.messages_by_id.values()], message_id, "assistant");
    require_streaming_assistant(current);
    const existing = current.parts.find((item) => item.part_id === part.part_id);
    if (existing && existing.sequence !== part.sequence) {
      throw new Error(`Assistant Part sequence changed: ${part.part_id}`);
    }
    const created_at = Date.now();
    const next_part = structuredClone(part);
    const message: SessionAssistantMessage = {
      ...current,
      revision: current.revision + 1,
      updated_at: created_at,
      parts: (existing
        ? current.parts.map((item) => item.part_id === part.part_id ? next_part : item)
        : [...current.parts, next_part]
      ).sort((left, right) => left.sequence - right.sequence),
    };
    await this.store.write_assistant_message(message);
    this.accept_mutation({
      mutation_id: generateId(),
      variant: "part",
      type: next_part.type,
      message_id,
      revision: message.revision,
      session_id: this.session_id,
      turn_id: message.turn_id,
      created_at,
      part_id: next_part.part_id,
      part: next_part,
    } as SessionMutation, message);
  }

  /** @internal 收口 Assistant Message。 */
  async complete_assistant_message(
    message_id: string,
    status: "completed" | "stopped" | "failed",
  ): Promise<void> {
    const current = require_message([...this.messages_by_id.values()], message_id, "assistant");
    require_streaming_assistant(current);
    const created_at = Date.now();
    const message: SessionAssistantMessage = {
      ...current,
      revision: current.revision + 1,
      status,
      updated_at: created_at,
      parts: current.parts.map((part) =>
        part.type === "text" || part.type === "reasoning"
          ? { ...part, state: "done" as const }
          : part,
      ),
    };
    await this.store.finalize_assistant_message(message);
    this.accept_message(message);
  }

  private async create_message(
    factory: (sequence: number, created_at: number) => SessionMessage,
    draft = false,
  ): Promise<SessionMessage> {
    if (draft) {
      const message = await this.store.create_assistant_message((state) => {
        const candidate = factory(state.message_sequence, Date.now());
        if (candidate.type !== "assistant" || candidate.status !== "streaming") {
          throw new Error("Draft Message must be a streaming Assistant");
        }
        return candidate;
      });
      this.accept_message(message);
      return message;
    }
    const message = await this.store.append_message((state) =>
      factory(state.message_sequence, Date.now()),
    );
    this.accept_message(message);
    return message;
  }

  /** 读取当前流式 Assistant 中的指定 Tool Part。 */
  find_streaming_tool(tool_call_id: string): SessionStreamingToolLocation | undefined {
    for (const message of this.messages_by_id.values()) {
      if (message.type !== "assistant" || message.status !== "streaming") continue;
      const part = message.parts.find(
        (item): item is SessionAssistantToolPart =>
          item.type === "tool" && item.tool_call_id === tool_call_id,
      );
      if (part) return { message_id: message.message_id, part };
    }
    return undefined;
  }

  private build_message_mutation(
    message: SessionMessage,
  ): SessionMessageSnapshotMutation {
    return {
      mutation_id: generateId(),
      variant: "message",
      type: message.type,
      message_id: message.message_id,
      sequence: message.sequence,
      revision: message.revision,
      session_id: this.session_id,
      ...(message.turn_id ? { turn_id: message.turn_id } : {}),
      created_at: message.updated_at,
      message,
    } as SessionMessageSnapshotMutation;
  }

  private accept_message(message: SessionMessage): void {
    this.accept_mutation(this.build_message_mutation(message), message);
  }

  private accept_mutation(mutation: SessionMutation, message: SessionMessage): void {
    this.messages_by_id.set(message.message_id, structuredClone(message));
    this.publish(mutation);
  }

  private async ensure_initialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
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
        data: to_session_json_value(candidate.data),
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

function require_streaming_assistant(
  message: SessionMessage,
): SessionAssistantMessage {
  if (message.type !== "assistant") {
    throw new Error(`Session Message is not assistant: ${message.message_id}`);
  }
  if (message.status !== "streaming") {
    throw new Error(`Assistant Message is already closed: ${message.message_id}`);
  }
  return message;
}

function resolve_import_id(map: Map<string, string>, source_id: string, prefix: string): string {
  const existing = map.get(source_id);
  if (existing) return existing;
  const created = `${prefix}:${generateId()}`;
  map.set(source_id, created);
  return created;
}

/** 按真实 Message sequence 升序排序。 */
function compare_message_sequence(left: SessionMessage, right: SessionMessage): number {
  return left.sequence - right.sequence;
}
