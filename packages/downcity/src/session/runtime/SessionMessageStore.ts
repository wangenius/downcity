/**
 * SessionMessageStore：session 消息写入与更新通知层。
 *
 * 关键点（中文）
 * - 只负责 user / assistant 消息的补写。
 * - 只负责会话更新后的异步通知。
 * - 不负责 session run 编排，也不负责执行状态追踪。
 */

import type {
  SessionMessageV1,
  SessionMetadataV1,
} from "@/shared/types/SessionMessage.js";
import type { JsonObject } from "@/shared/types/Json.js";
import { SessionRuntimeStore } from "@session/SessionRuntimeStore.js";

/**
 * SessionMessageStore：统一消息写入层。
 */
export class SessionMessageStore {
  private readonly runtimeRegistry: SessionRuntimeStore;
  private readonly runAfterSessionUpdated?: (sessionId: string) => Promise<void>;

  constructor(params: {
    /**
     * Session runtime / persistor store。
     */
    runtimeRegistry: SessionRuntimeStore;
    /**
     * session 更新后的异步回调。
     */
    runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
  }) {
    this.runtimeRegistry = params.runtimeRegistry;
    this.runAfterSessionUpdated = params.runAfterSessionUpdated;
  }

  /**
   * 触发会话更新回调。
   */
  async afterSessionUpdatedAsync(sessionId: string): Promise<void> {
    const key = String(sessionId || "").trim();
    if (!key) return;
    if (!this.runAfterSessionUpdated) return;
    try {
      await this.runAfterSessionUpdated(key);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 user 消息到历史。
   */
  async appendUserMessage(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    text?: string;
    /**
     * 当前请求标识。
     */
    requestId?: string;
    /**
     * 附加元数据。
     */
    extra?: JsonObject;
  }): Promise<void> {
    const sessionId = String(params.sessionId || "").trim();
    if (!sessionId) return;

    try {
      const persistor = this.runtimeRegistry.getPersistor(sessionId);
      const message = params.message;
      if (message && typeof message === "object") {
        await persistor.append(message);
        void this.afterSessionUpdatedAsync(sessionId);
        return;
      }

      const fallbackText = String(params.text || "").trim();
      if (!fallbackText) return;

      const msg = persistor.userText({
        text: fallbackText,
        metadata: {
          sessionId,
          requestId: params.requestId,
          extra: params.extra,
        } as Omit<SessionMetadataV1, "v" | "ts">,
      });
      await persistor.append(msg);
      void this.afterSessionUpdatedAsync(sessionId);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 assistant 消息到历史。
   */
  async appendAssistantMessage(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    fallbackText?: string;
    /**
     * 当前请求标识。
     */
    requestId?: string;
    /**
     * 附加元数据。
     */
    extra?: JsonObject;
  }): Promise<void> {
    const sessionId = String(params.sessionId || "").trim();
    if (!sessionId) return;

    try {
      const persistor = this.runtimeRegistry.getPersistor(sessionId);
      const message = params.message;
      if (message && typeof message === "object") {
        await persistor.append(message);
        void this.afterSessionUpdatedAsync(sessionId);
        return;
      }

      const fallbackText = String(params.fallbackText || "").trim();
      if (!fallbackText) return;

      await persistor.append(
        persistor.assistantText({
          text: fallbackText,
          metadata: {
            sessionId,
            requestId: params.requestId,
            extra: params.extra,
          },
          kind: "normal",
          source: "egress",
        }),
      );
      void this.afterSessionUpdatedAsync(sessionId);
    } catch {
      // ignore
    }
  }
}
