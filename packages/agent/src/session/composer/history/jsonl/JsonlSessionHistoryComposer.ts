/**
 * JsonlSessionHistoryComposer：基于 JSONL store 的 history 组装器。
 *
 * 关键点（中文）
 * - 只负责 `prepare()`，把 history store 中的消息组装成本轮模型输入。
 * - 不负责 append / list / meta / compact 等落盘能力。
 * - JSONL 文件事实源由 `JsonlSessionHistoryStore` 承担。
 */

import type { Tool } from "ai";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import type { SessionHistoryStore } from "@/session/store/history/SessionHistoryStore.js";
import type {
  SessionHistoryComposer,
  SessionHistoryPrepareInput,
} from "@session/composer/history/SessionHistoryComposer.js";

/**
 * JSONL history composer 构造参数。
 */
export type JsonlSessionHistoryComposerOptions = {
  /**
   * 当前 history 事实源。
   */
  store: SessionHistoryStore;
};

/**
 * JSONL history composer。
 */
export class JsonlSessionHistoryComposer implements SessionHistoryComposer {
  readonly name = "jsonl_history_composer";
  readonly sessionId: string;

  private readonly store: SessionHistoryStore;

  constructor(options: JsonlSessionHistoryComposerOptions) {
    this.store = options.store;
    this.sessionId = String(options.store?.sessionId || "").trim();
    if (!this.sessionId) {
      throw new Error("JsonlSessionHistoryComposer requires a non-empty sessionId");
    }
  }

  private normalizeTools(tools: Record<string, Tool>): Record<string, Tool> {
    return tools && typeof tools === "object" ? { ...tools } : {};
  }

  private readUserSessionMessageText(message: SessionMessageV1): string {
    if (!message || typeof message !== "object" || message.role !== "user") {
      return "";
    }
    const parts = Array.isArray(message.parts) ? message.parts : [];
    return parts
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const candidate = part as { type?: unknown; text?: unknown };
        if (candidate.type === "text" && typeof candidate.text === "string") {
          return candidate.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  private hasTrailingUserQuery(
    messages: SessionMessageV1[],
    query: string,
  ): boolean {
    const target = String(query || "").trim();
    if (!target) return true;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (!item || typeof item !== "object") continue;
      if (item.role !== "user") continue;
      return this.readUserSessionMessageText(item) === target;
    }
    return false;
  }

  private sanitizeMessages(messages: SessionMessageV1[]): SessionMessageV1[] {
    if (!Array.isArray(messages)) return [];
    return messages
      .map((message) => {
        const parts = Array.isArray(message.parts)
          ? message.parts.filter((part) => part && typeof part === "object")
          : [];
        return {
          ...message,
          parts,
        };
      })
      .filter((message) => Array.isArray(message.parts) && message.parts.length > 0);
  }

  async prepare(input: SessionHistoryPrepareInput): Promise<SessionMessageV1[]> {
    const query = String(input.query || "").trim();
    const tools = this.normalizeTools(input.tools);
    void tools;

    let baseMessages = this.sanitizeMessages(await this.store.list());
    if ((!Array.isArray(baseMessages) || baseMessages.length === 0) && query) {
      baseMessages = [
        this.store.userText({
          text: query,
          metadata: {
            sessionId: this.sessionId,
          },
        }),
      ];
    }
    if (query && !this.hasTrailingUserQuery(baseMessages, query)) {
      baseMessages = [
        ...baseMessages,
        this.store.userText({
          text: query,
          metadata: {
            sessionId: this.sessionId,
          },
        }),
      ];
    }
    return baseMessages;
  }
}
