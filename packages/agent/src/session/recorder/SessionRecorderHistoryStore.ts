/**
 * SessionRecorder 到 Executor SessionHistoryStore 的内部投影适配器。
 *
 * 关键点（中文）
 * - Recorder 的 active.jsonl、segments 与 assistant_message.json 共同组成持久化事实源。
 * - Executor 继续读取临时 UIMessage 投影，不直接拥有文件写入权。
 * - 流式草稿写入由 AssistantMessageWriter 负责，Executor 的旧接口只提供投影兼容。
 */

import { nanoid } from "nanoid";
import type {
  SessionActionRecordV1,
  SessionMetadataV1,
  SessionRecordV1,
} from "@/executor/types/SessionRecords.js";
import { is_session_action_record } from "@/executor/types/SessionRecords.js";
import type {
  SessionHistoryCompactInput,
  SessionHistoryStore,
} from "@/executor/store/history/SessionHistoryStore.js";
import { SessionRecorder } from "@/session/recorder/SessionRecorder.js";
import {
  from_ui_assistant_parts,
  from_ui_user_parts,
  to_executor_ui_message,
} from "@/session/recorder/SessionMessageCodec.js";
import { compact_session_recorder_messages } from "@/session/recorder/SessionRecorderCompaction.js";

/** Recorder History Store 构造参数。 */
export interface SessionRecorderHistoryStoreOptions {
  /** 当前 Session 标识。 */
  session_id: string;
  /** 当前 Session Recorder。 */
  recorder: SessionRecorder;
}

/** 只把 canonical SessionMessage 投影给 Executor 的 Store。 */
export class SessionRecorderHistoryStore implements SessionHistoryStore {
  readonly sessionId: string;

  private readonly recorder: SessionRecorder;

  constructor(options: SessionRecorderHistoryStoreOptions) {
    this.sessionId = String(options.session_id || "").trim();
    this.recorder = options.recorder;
    if (!this.sessionId) {
      throw new Error("SessionRecorderHistoryStore requires session_id");
    }
  }

  /** 把外部 user/assistant/action 写入请求收口到 Recorder。 */
  async write_record(message: SessionRecordV1): Promise<void> {
    if (is_session_action_record(message)) {
      const action = message as SessionActionRecordV1;
      const existing = this.recorder.get_message(action.id);
      if (existing?.type === "action") {
        if (action.state !== "running") {
          await this.recorder.update_action_message(
            action.id,
            action.state,
            {
              title: action.title,
              description: action.description,
            },
          );
        }
        return;
      }
      const writer = await this.recorder.open_action_message({
        message_id: action.id,
        turn_id: action.metadata.turnId,
        action_type: infer_action_type(action.id),
        title: action.title,
        description: action.description,
      });
      if (action.state === "completed") await writer.complete();
      if (action.state === "failed") await writer.fail(action.description || action.title);
      return;
    }

    if (message.role === "user") {
      const metadata = message.metadata || {
        v: 1 as const,
        ts: Date.now(),
        sessionId: this.sessionId,
      };
      await this.recorder.append_user_message({
        turn_id: String(metadata.turnId || `external:${nanoid(10)}`),
        input_type:
          metadata.extra?.inputType === "steer" ? "steer" : "prompt",
        parts: from_ui_user_parts(message.parts),
      });
      return;
    }

    const metadata = message.metadata || {
      v: 1 as const,
      ts: Date.now(),
      sessionId: this.sessionId,
    };
    await this.recorder.append_completed_assistant_message({
      turn_id: metadata.turnId,
      parts: from_ui_assistant_parts(message.parts),
      visibility:
        metadata.extra?.visibility === "internal"
          ? "internal"
          : "visible",
      kind: metadata.kind === "summary" ? "summary" : "normal",
    });
  }

  /** 从 Recorder 当前快照投影运行中的 Assistant。 */
  async read_inflight(): Promise<SessionRecordV1 | null> {
    const snapshot = await this.recorder.context_snapshot();
    const assistant = [...snapshot.messages]
      .reverse()
      .find(
        (message) =>
          message.type === "assistant" && message.status === "streaming",
      );
    return assistant ? to_executor_ui_message(assistant) : null;
  }

  /** Executor 草稿写入口不持久化；流式内容由 Recorder writer 负责。 */
  async write_inflight(_message: SessionRecordV1): Promise<void> {}

  /** Executor 草稿收口入口不持久化；Assistant writer 负责 complete。 */
  async finalize_inflight(_message?: SessionRecordV1 | null): Promise<void> {}

  /** 返回 Context Composer 使用的 UIMessage 投影。 */
  async list_records(): Promise<SessionRecordV1[]> {
    const snapshot = await this.recorder.context_snapshot();
    const records: SessionRecordV1[] = [];
    if (snapshot.summary) {
      records.push({
        id: snapshot.summary.summary_id,
        role: "assistant",
        metadata: {
          v: 1,
          ts: snapshot.summary.created_at,
          sessionId: this.sessionId,
          source: "compact",
          kind: "summary",
          extra: {
            visibility: "internal",
            summaryThroughSequence: snapshot.summary.through_sequence,
          },
        },
        parts: [{ type: "text", text: snapshot.summary.text }],
      });
    }
    for (const message of snapshot.messages) {
      if (message.type !== "user" && message.type !== "assistant") continue;
      const projected = to_executor_ui_message(message);
      if (projected) records.push(projected);
    }
    return records;
  }

  /** 返回 Context Message 区间。 */
  async slice_records(start: number, end: number): Promise<SessionRecordV1[]> {
    return (await this.list_records()).slice(start, end);
  }

  /** 返回 Context Message 数量。 */
  async record_count(): Promise<number> {
    return (await this.list_records()).length;
  }

  /** Recorder metadata 由 SessionStateService 管理。 */
  async meta(): Promise<Record<string, unknown>> {
    return {};
  }

  /** 通过 Recorder 把 Active 前缀关闭为带累计 Summary 的 Segment。 */
  async compact(input: SessionHistoryCompactInput): Promise<{
    compacted: boolean;
    reason?: string;
  }> {
    return await compact_session_recorder_messages({
      recorder: this.recorder,
      compact_input: input,
    });
  }

  /** 构造临时 user UIMessage。 */
  userText(input: {
    text: string;
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    id?: string;
  }): SessionRecordV1 {
    const { ts, ...metadata } = input.metadata;
    return {
      id: input.id || `u:${this.sessionId}:${nanoid(10)}`,
      role: "user",
      metadata: {
        v: 1,
        ts: typeof ts === "number" ? ts : Date.now(),
        ...metadata,
        source: "ingress",
        kind: "normal",
      },
      parts: [{ type: "text", text: String(input.text || "") }],
    };
  }

  /** 构造临时 assistant UIMessage。 */
  assistantText(input: {
    text: string;
    metadata: Omit<SessionMetadataV1, "v" | "ts"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    id?: string;
    kind?: "normal" | "summary";
    source?: "egress" | "compact";
  }): SessionRecordV1 {
    const { ts, ...metadata } = input.metadata;
    return {
      id: input.id || `a:${this.sessionId}:${nanoid(10)}`,
      role: "assistant",
      metadata: {
        v: 1,
        ts: typeof ts === "number" ? ts : Date.now(),
        ...metadata,
        source: input.source || "egress",
        kind: input.kind || "normal",
      },
      parts: [{ type: "text", text: String(input.text || "") }],
    };
  }

  /** 返回 action 原结构，真正持久化仍经过 write_record。 */
  action(input: {
    action: SessionActionRecordV1;
    metadata: Pick<SessionMetadataV1, "sessionId"> &
      Partial<Pick<SessionMetadataV1, "ts">>;
    id?: string;
  }): SessionActionRecordV1 {
    return {
      ...input.action,
      id: input.id || input.action.id,
      metadata: {
        ...input.action.metadata,
        sessionId: input.metadata.sessionId,
        ts:
          typeof input.metadata.ts === "number"
            ? input.metadata.ts
            : input.action.metadata.ts,
      },
    };
  }
}

function infer_action_type(message_id: string): string {
  return String(message_id || "").split(":")[0] || "action";
}
