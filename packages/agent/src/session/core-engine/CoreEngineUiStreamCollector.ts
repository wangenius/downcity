/**
 * Session UI stream 最终消息收敛器。
 *
 * 关键点（中文）
 * - 必须完整消费 AI SDK UI stream，才能稳定触发 `onFinish`。
 * - 优先使用结构化 `responseMessage`；缺失时才回退到纯文本。
 * - UI chunk 回调是展示层副作用，失败不应阻断 session 执行。
 */

import type { streamText } from "ai";
import type { Logger } from "@/utils/logger/Logger.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { SessionMessageV1 } from "@/session/types/SessionMessages.js";
import { getSessionRunScope } from "@session/SessionRunScope.js";
import {
  summarizeUiMessageForDebug,
  toInlinePreview,
} from "@session/core-engine/CoreEngineSignals.js";

/**
 * 收敛 UI stream 中的最终 assistant 消息。
 */
export async function collectFinalAssistantMessageFromUiStream(params: {
  /**
   * 当前 `streamText` 执行结果。
   */
  result: ReturnType<typeof streamText>;
  /**
   * 当前 sessionId，用于日志关联。
   */
  sessionId: string;
  /**
   * 当前日志器。
   */
  logger: Logger;
  /**
   * 构造 fallback assistant 消息的工厂函数。
   */
  buildFallbackAssistantMessage: (text: string) => SessionMessageV1;
}): Promise<SessionMessageV1> {
  let streamedAssistantMessage: SessionMessageV1 | null = null;
  let uiFinishSummary: JsonObject | null = null;

  const uiStream = params.result.toUIMessageStream<SessionMessageV1>({
    // 关键点（中文）：SDK stream 需要 reasoning 旁路事件时可直接消费；最终落盘仍由 responseMessage 收敛。
    sendReasoning: true,
    sendSources: false,
    onFinish: (event) => {
      streamedAssistantMessage = event.responseMessage ?? null;
      uiFinishSummary = {
        isContinuation: event.isContinuation,
        isAborted: event.isAborted,
        finishReason:
          typeof event.finishReason === "string" ? event.finishReason : null,
        ...summarizeUiMessageForDebug(event.responseMessage),
      };
    },
  });

  const onUiMessageChunkCallback =
    getSessionRunScope()?.onUiMessageChunkCallback;
  for await (const chunk of uiStream) {
    if (typeof onUiMessageChunkCallback !== "function") continue;
    try {
      await onUiMessageChunkCallback(chunk);
    } catch {
      // ignore UI stream callback failures
    }
  }

  await params.logger.log("info", "[agent] ui.finish", {
    sessionId: params.sessionId,
    ...(uiFinishSummary || {
      responseMessageMissing: true,
    }),
  });

  if (streamedAssistantMessage) return streamedAssistantMessage;

  let assistantText = "";
  try {
    assistantText = String((await params.result.text) ?? "").trim();
  } catch {
    assistantText = "";
  }

  await params.logger.log("warn", "[agent] final.message.fallback", {
    sessionId: params.sessionId,
    assistantTextLength: assistantText.length,
    assistantTextPreview: toInlinePreview(assistantText),
  });

  return params.buildFallbackAssistantMessage(
    assistantText || "Execution completed",
  );
}
