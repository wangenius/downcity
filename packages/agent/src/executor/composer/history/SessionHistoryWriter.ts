/**
 * SessionHistoryWriter：单个 Session 的消息写入器。
 *
 * 关键点（中文）
 * - 只负责当前 session 的 user / assistant 消息补写。
 * - 只依赖当前 session 的 history Store，不感知其他 session。
 */

import type { JsonObject } from "@/types/common/Json.js";
import type {
  SessionRecordV1,
  SessionMetadataV1,
} from "@/executor/types/SessionRecords.js";
import type { SessionHistoryStore } from "@/executor/store/history/SessionHistoryStore.js";

type SessionHistoryWriterOptions = {
  /**
   * 当前 session 标识。
   */
  sessionId: string;

  /**
   * 获取当前 session 对应的 history Store。
   */
  getHistoryStore: () => SessionHistoryStore;

};

/**
 * SessionHistoryWriter：单 session 写入器。
 */
export class SessionHistoryWriter {
  private readonly sessionId: string;
  private readonly getHistoryStore: SessionHistoryWriterOptions["getHistoryStore"];

  constructor(options: SessionHistoryWriterOptions) {
    this.sessionId = String(options.sessionId || "").trim();
    this.getHistoryStore = options.getHistoryStore;
    if (!this.sessionId) {
      throw new Error("SessionHistoryWriter requires a non-empty sessionId");
    }
  }

  /**
   * 追加一条 user 消息。
   */
  async append_user_message(params: {
    message?: SessionRecordV1 | null;
    text?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const historyStore = this.getHistoryStore();
    if (params.message && typeof params.message === "object") {
      await historyStore.write_record(params.message);
      return;
    }

    const fallbackText = String(params.text || "").trim();
    if (!fallbackText) return;

    const message = historyStore.userText({
      text: fallbackText,
      metadata: {
        sessionId: this.sessionId,
        extra: params.extra,
      } as Omit<SessionMetadataV1, "v" | "ts">,
    });
    await historyStore.write_record(message);
  }

  /**
   * 追加一条 assistant 消息。
   */
  async append_assistant_message(params: {
    message?: SessionRecordV1 | null;
    fallbackText?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const historyStore = this.getHistoryStore();
    if (params.message && typeof params.message === "object") {
      await historyStore.finalize_inflight(params.message);
      return;
    }

    const fallbackText = String(params.fallbackText || "").trim();
    if (!fallbackText) return;

    await historyStore.finalize_inflight(
      historyStore.assistantText({
        text: fallbackText,
        metadata: {
          sessionId: this.sessionId,
          extra: params.extra,
        },
        kind: "normal",
        source: "egress",
      }),
    );
  }
}
