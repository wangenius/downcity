/**
 * SessionHistoryWriter：单个 Session 的消息写入器。
 *
 * 关键点（中文）
 * - 只负责当前 session 的 user / assistant 消息补写。
 * - 只依赖当前 session 的 history Composer，不感知其他 session。
 * - 会话更新后的通知也收在这里，避免把写入细节散到 Session 主类里。
 */

import type { JsonObject } from "@/shared/types/Json.js";
import type {
  SessionMessageV1,
  SessionMetadataV1,
} from "@/types/session/SessionMessages.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";

type SessionHistoryWriterOptions = {
  /**
   * 当前 session 标识。
   */
  sessionId: string;

  /**
   * 获取当前 session 对应的 history Composer。
   */
  getHistoryComposer: () => SessionHistoryComposer;

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
  private readonly getHistoryComposer: SessionHistoryWriterOptions["getHistoryComposer"];
  private readonly runAfterSessionUpdated?: SessionHistoryWriterOptions["runAfterSessionUpdated"];

  constructor(options: SessionHistoryWriterOptions) {
    this.sessionId = String(options.sessionId || "").trim();
    this.getHistoryComposer = options.getHistoryComposer;
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
      const historyComposer = this.getHistoryComposer();
      if (params.message && typeof params.message === "object") {
        await historyComposer.append(params.message);
        void this.afterSessionUpdatedAsync();
        return;
      }

      const fallbackText = String(params.text || "").trim();
      if (!fallbackText) return;

      const message = historyComposer.userText({
        text: fallbackText,
        metadata: {
          sessionId: this.sessionId,
          extra: params.extra,
        } as Omit<SessionMetadataV1, "v" | "ts">,
      });
      await historyComposer.append(message);
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
      const historyComposer = this.getHistoryComposer();
      if (params.message && typeof params.message === "object") {
        await historyComposer.append(params.message);
        void this.afterSessionUpdatedAsync();
        return;
      }

      const fallbackText = String(params.fallbackText || "").trim();
      if (!fallbackText) return;

      await historyComposer.append(
        historyComposer.assistantText({
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
