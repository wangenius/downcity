/**
 * SessionHistoryWriter：单个 Session 的消息写入器。
 *
 * 关键点（中文）
 * - 只负责当前 session 的 user / assistant 消息补写。
 * - 只依赖当前 session 的 history Store，不感知其他 session。
 * - 会话更新后的通知也收在这里，避免把写入细节散到 Session 主类里。
 */

import type { JsonObject } from "@/types/common/Json.js";
import type {
  SessionMessageV1,
  SessionMetadataV1,
} from "@/session/types/SessionMessages.js";
import type { SessionHistoryStore } from "@/session/store/history/SessionHistoryStore.js";

type SessionHistoryWriterOptions = {
  /**
   * 当前 session 标识。
   */
  sessionId: string;

  /**
   * 获取当前 session 对应的 history Store。
   */
  getHistoryStore: () => SessionHistoryStore;

  /**
   * session 更新后的异步回调。
   */
  runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
};

/**
 * SessionHistoryWriter：单 session 写入器。
 */
export class SessionHistoryWriter {
  private readonly sessionId: string;
  private readonly getHistoryStore: SessionHistoryWriterOptions["getHistoryStore"];
  private readonly runAfterSessionUpdated?: SessionHistoryWriterOptions["runAfterSessionUpdated"];

  constructor(options: SessionHistoryWriterOptions) {
    this.sessionId = String(options.sessionId || "").trim();
    this.getHistoryStore = options.getHistoryStore;
    this.runAfterSessionUpdated = options.runAfterSessionUpdated;
    if (!this.sessionId) {
      throw new Error("SessionHistoryWriter requires a non-empty sessionId");
    }
  }

  /**
   * 触发 session 更新后的异步回调。
   */
  async afterSessionUpdatedAsync(): Promise<void> {
    if (!this.runAfterSessionUpdated) return;
    try {
      await this.runAfterSessionUpdated(this.sessionId);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 user 消息。
   */
  async appendUserMessage(params: {
    message?: SessionMessageV1 | null;
    text?: string;
    extra?: JsonObject;
  }): Promise<void> {
    try {
      const historyStore = this.getHistoryStore();
      if (params.message && typeof params.message === "object") {
        await historyStore.append(params.message);
        void this.afterSessionUpdatedAsync();
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
      await historyStore.append(message);
      void this.afterSessionUpdatedAsync();
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 assistant 消息。
   */
  async appendAssistantMessage(params: {
    message?: SessionMessageV1 | null;
    fallbackText?: string;
    extra?: JsonObject;
  }): Promise<void> {
    try {
      const historyStore = this.getHistoryStore();
      if (params.message && typeof params.message === "object") {
        await historyStore.append(params.message);
        void this.afterSessionUpdatedAsync();
        return;
      }

      const fallbackText = String(params.fallbackText || "").trim();
      if (!fallbackText) return;

      await historyStore.append(
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
      void this.afterSessionUpdatedAsync();
    } catch {
      // ignore
    }
  }
}
