/**
 * AssistantResultPersistence：统一处理一次 run 结束后的 assistant 落盘决策。
 *
 * 关键点（中文）
 * - 负责收敛“写完整 assistant message / 写 fallback 文本 / 完全跳过”三种分支。
 * - 避免 SDK、HTTP execute、control execute、chat queue 各自复制一套判断。
 * - 运行中 step/tool 的持久化由 inflight 快照承担；run 结束时只关心最终 assistant 如何收口。
 */

import type {
  SessionMessageV1,
  SessionModelMessageV1,
} from "@/executor/types/SessionMessages.js";
import { resolveAssistantMessageForPersistence } from "@/executor/messages/UserVisibleText.js";

/**
 * assistant 写入端口。
 */
export interface AssistantResultPersistenceWriter {
  /**
   * 追加 assistant 消息。
   */
  appendAssistantMessage(params: {
    /**
     * 已构造好的完整 assistant 消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 在没有完整 message 可写时的兜底文本。
     */
    fallbackText?: string;
  }): Promise<void>;
}

/**
 * 一次 run 结束后的 assistant 落盘参数。
 */
export interface PersistAssistantResultParams {
  /**
   * assistant 写入端口。
   */
  writer: AssistantResultPersistenceWriter;
  /**
   * 本轮执行得到的 assistant message。
   */
  assistantMessage: SessionModelMessageV1 | null | undefined;
  /**
   * 可选兜底文本。
   *
   * 关键点（中文）
   * - 仅在没有完整 assistant message 时才允许写入。
   * - inflight 快照的正式收口由 history store 负责，这里不再处理旧的 step 独立落盘分支。
   */
  fallbackText?: string;
}

function normalizeFallbackText(input: string | undefined): string | undefined {
  const text = String(input || "").trim();
  return text || undefined;
}

/**
 * 解析本轮 run 最终应该如何持久化 assistant。
 */
export function buildAssistantResultPersistencePayload(
  params: Omit<PersistAssistantResultParams, "writer">,
): {
  /**
   * 已构造好的完整 assistant message。
   */
  message?: SessionModelMessageV1 | null;
  /**
   * 允许写入的兜底文本。
   */
  fallbackText?: string;
} | null {
  const persistedMessage = resolveAssistantMessageForPersistence(
    params.assistantMessage,
  );
  if (persistedMessage) {
    return {
      message: persistedMessage,
    };
  }

  const fallbackText = normalizeFallbackText(params.fallbackText);
  if (!fallbackText) return null;
  return {
    fallbackText,
  };
}

/**
 * 按统一规则持久化一次 run 的 assistant 结果。
 */
export async function persistAssistantResult(
  params: PersistAssistantResultParams,
): Promise<boolean> {
  const payload = buildAssistantResultPersistencePayload({
    assistantMessage: params.assistantMessage,
    fallbackText: params.fallbackText,
  });
  if (!payload) return false;
  await params.writer.appendAssistantMessage(payload);
  return true;
}
