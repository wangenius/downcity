/**
 * ChatIngressStore：统一处理 chat 入站消息的持久化。
 *
 * 关键点（中文）
 * - `exec` 入站既要写 `chat history`，也要写 `session messages`
 * - 把持久化职责固定在 ingress 边界，避免遗漏到 queue worker
 * - 后续 extension / dashboard / 其他外部入口都应复用这里
 */

import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import { appendInboundChatHistory } from "./ChatHistoryStore.js";

/**
 * 统一补齐 exec 入站的 context extra。
 *
 * 关键点（中文）
 * - `ingressKind=exec` 是模型上下文需要的最小语义标记
 * - 调用方原有 extra 保持透传
 */
export function buildExecIngressExtra(extra?: JsonObject): JsonObject {
  return {
    ...(extra && typeof extra === "object" ? extra : {}),
    ingressKind: "exec",
  };
}

/**
 * 仅写入 session messages。
 *
 * 说明（中文）
 * - 适用于已经有其他审计链路，或只需要补齐模型上下文的场景
 */
export async function appendExecSessionMessage(params: {
  context: ExecutionContext;
  sessionId: string;
  text: string;
  extra?: JsonObject;
}): Promise<void> {
  await params.context.session.appendUserMessage({
    sessionId: params.sessionId,
    text: params.text,
    extra: buildExecIngressExtra(params.extra),
  });
}

/**
 * 写入完整 exec 入站记录。
 *
 * 流程（中文）
 * 1. 先写 `chat history` 审计流
 * 2. 再写 `session messages`，保证模型上下文可见
 */
export async function appendExecIngress(params: {
  context: ExecutionContext;
  sessionId: string;
  channel: ChatDispatchChannel;
  chatId: string;
  text: string;
  targetType?: string;
  threadId?: number;
  messageId?: string;
  actorId?: string;
  actorName?: string;
  extra?: JsonObject;
}): Promise<void> {
  const execExtra = buildExecIngressExtra(params.extra);
  await appendInboundChatHistory({
    context: params.context,
    sessionId: params.sessionId,
    channel: params.channel,
    chatId: params.chatId,
    ingressKind: "exec",
    text: params.text,
    ...(params.targetType ? { targetType: params.targetType } : {}),
    ...(typeof params.threadId === "number" ? { threadId: params.threadId } : {}),
    ...(params.messageId ? { messageId: params.messageId } : {}),
    ...(params.actorId ? { actorId: params.actorId } : {}),
    ...(params.actorName ? { actorName: params.actorName } : {}),
    extra: execExtra,
  });
  await appendExecSessionMessage({
    context: params.context,
    sessionId: params.sessionId,
    text: params.text,
    extra: execExtra,
  });
}
