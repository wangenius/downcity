/**
 * AssistantResultPersistence：统一处理一次 run 结束后的 assistant 落盘决策。
 *
 * 关键点（中文）
 * - 负责收敛“写完整 assistant message / 写 fallback 文本 / 完全跳过”三种分支。
 * - 避免 SDK、HTTP execute、control execute、chat queue 各自复制一套判断。
 * - 一旦 step 消息已经单独持久化，最终 merged assistant 必须跳过，不能再补一条 fallback。
 */

import type { SessionMessageV1 } from "@/executor/types/SessionMessages.js";
import {
  hasPersistedAssistantSteps,
  resolveAssistantMessageForPersistence,
} from "@/plugin/builtins/chat/runtime/UserVisibleText.js";

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
  assistantMessage: SessionMessageV1 | null | undefined;
  /**
   * 可选兜底文本。
   *
   * 关键点（中文）
   * - 仅在没有完整 assistant message 且未发生 step 持久化时才允许写入。
   * - 若 step 已单独落盘，这里必须被忽略，避免重复 assistant。
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
  message?: SessionMessageV1 | null;
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

  // 关键点（中文）：step 已经单独落盘时，最终 merged assistant 必须完全跳过。
  if (hasPersistedAssistantSteps(params.assistantMessage)) {
    return null;
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
