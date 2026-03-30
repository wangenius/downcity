/**
 * ChatQueueReplyDispatch：chat queue worker 的回复分发模块。
 *
 * 关键点（中文）
 * - 收敛 direct/fallback 两类 channel 回发逻辑。
 * - ChatQueueWorker 主类只保留“何时分发”的决策，不再承载具体发消息细节。
 */

import type { Logger } from "@utils/logger/Logger.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { SessionMessageV1 } from "@/types/SessionMessage.js";
import { extractTextFromUiMessage } from "./UIMessageTransformer.js";
import { parseDirectDispatchAssistantText } from "./DirectDispatchParser.js";
import { sendActionByChatKey } from "./ChatkeySend.js";
import { sendChatTextByChatKey } from "../Action.js";
import {
  emitChatReplyEffect,
  prepareChatReplyText,
  resolveChatReplyTarget,
} from "./ReplyDispatch.js";

/**
 * 是否启用 direct 回发模式。
 */
function isDirectModeEnabled(runtime: ExecutionContext): boolean {
  return (runtime.config.services?.chat?.method || "direct") !== "cmd";
}

/**
 * direct 模式：把 assistant 纯文本直接投递到 chat。
 */
export async function dispatchAssistantTextDirect(params: {
  logger: Logger;
  runtime: ExecutionContext;
  sessionId: string;
  assistantText: string;
  phase?: "step" | "final" | "error";
}): Promise<boolean> {
  if (!isDirectModeEnabled(params.runtime)) return false;

  const plan = parseDirectDispatchAssistantText({
    assistantText: params.assistantText,
    fallbackChatKey: params.sessionId,
  });
  if (!plan) return false;
  let textDispatchSucceeded = false;

  if (plan.text) {
    const target = await resolveChatReplyTarget({
      runtime: params.runtime,
      chatKey: plan.text.chatKey,
    });
    const preparedText = await prepareChatReplyText({
      runtime: params.runtime,
      input: {
        chatKey: plan.text.chatKey,
        ...(target.channel ? { channel: target.channel } : {}),
        ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
        ...(typeof plan.text.messageId === "string"
          ? { messageId: plan.text.messageId }
          : typeof target.messageId === "string"
            ? { messageId: target.messageId }
            : {}),
        text: plan.text.text,
        phase: params.phase || "final",
        mode: "direct",
      },
    });
    const textResult = await sendChatTextByChatKey({
      context: params.runtime,
      chatKey: plan.text.chatKey,
      text: preparedText,
      replyToMessage: plan.text.replyToMessage,
      messageId: plan.text.messageId,
      ...(typeof plan.text.delayMs === "number"
        ? { delayMs: plan.text.delayMs }
        : {}),
      ...(typeof plan.text.sendAtMs === "number"
        ? { sendAtMs: plan.text.sendAtMs }
        : {}),
    });
    await emitChatReplyEffect({
      runtime: params.runtime,
      input: {
        chatKey: plan.text.chatKey,
        ...(target.channel ? { channel: target.channel } : {}),
        ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
        ...(typeof plan.text.messageId === "string"
          ? { messageId: plan.text.messageId }
          : typeof target.messageId === "string"
            ? { messageId: target.messageId }
            : {}),
        text: preparedText,
        phase: params.phase || "final",
        mode: "direct",
        success: textResult.success,
        ...(textResult.success ? {} : { error: textResult.error || "chat send failed" }),
      },
    });
    if (!textResult.success) {
      params.logger.warn("Direct chat text dispatch failed", {
        sessionId: params.sessionId,
        targetChatKey: plan.text.chatKey,
        error: textResult.error || "chat send failed",
      });
    } else {
      textDispatchSucceeded = true;
    }
  }

  for (const reaction of plan.reactions) {
    const reactResult = await sendActionByChatKey({
      context: params.runtime,
      chatKey: reaction.chatKey,
      action: "react",
      messageId: reaction.messageId,
      reactionEmoji: reaction.emoji,
      reactionIsBig: reaction.big,
    });
    if (!reactResult.success) {
      params.logger.warn("Direct chat reaction dispatch failed", {
        sessionId: params.sessionId,
        targetChatKey: reaction.chatKey,
        error: reactResult.error || "chat react failed",
      });
    }
  }

  return textDispatchSucceeded;
}

/**
 * direct 模式：从 assistant UIMessage 中提取文本并投递。
 */
export async function dispatchAssistantMessageDirect(params: {
  logger: Logger;
  runtime: ExecutionContext;
  sessionId: string;
  assistantMessage: SessionMessageV1 | null | undefined;
}): Promise<boolean> {
  return dispatchAssistantTextDirect({
    logger: params.logger,
    runtime: params.runtime,
    sessionId: params.sessionId,
    assistantText: extractTextFromUiMessage(params.assistantMessage),
    phase: "final",
  });
}

/**
 * 无论 chat method（direct/cmd），都强制把文本回发到 channel。
 */
export async function dispatchTextToChannel(params: {
  logger: Logger;
  runtime: ExecutionContext;
  sessionId: string;
  text: string;
  messageId?: string;
  phase?: "step" | "final" | "error";
}): Promise<boolean> {
  const text = String(params.text || "").trim();
  if (!text) return false;
  const target = await resolveChatReplyTarget({
    runtime: params.runtime,
    chatKey: params.sessionId,
  });
  const preparedText = await prepareChatReplyText({
    runtime: params.runtime,
    input: {
      chatKey: params.sessionId,
      ...(target.channel ? { channel: target.channel } : {}),
      ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
      ...(typeof params.messageId === "string"
        ? { messageId: params.messageId }
        : typeof target.messageId === "string"
          ? { messageId: target.messageId }
          : {}),
      text,
      phase: params.phase || "final",
      mode: "fallback",
    },
  });

  const result = await sendChatTextByChatKey({
    context: params.runtime,
    chatKey: params.sessionId,
    text: preparedText,
    replyToMessage: true,
    ...(typeof params.messageId === "string" && params.messageId
      ? { messageId: params.messageId }
      : {}),
  });
  await emitChatReplyEffect({
    runtime: params.runtime,
    input: {
      chatKey: params.sessionId,
      ...(target.channel ? { channel: target.channel } : {}),
      ...(typeof target.chatId === "string" ? { chatId: target.chatId } : {}),
      ...(typeof params.messageId === "string"
        ? { messageId: params.messageId }
        : typeof target.messageId === "string"
          ? { messageId: target.messageId }
          : {}),
      text: preparedText,
      phase: params.phase || "final",
      mode: "fallback",
      success: result.success,
      ...(result.success ? {} : { error: result.error || "chat send failed" }),
    },
  });

  if (!result.success) {
    params.logger.warn("ChatQueueWorker forced channel dispatch failed", {
      sessionId: params.sessionId,
      error: result.error || "chat send failed",
    });
    return false;
  }
  return true;
}
