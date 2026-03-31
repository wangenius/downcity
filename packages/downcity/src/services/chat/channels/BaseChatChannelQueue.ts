/**
 * BaseChatChannel 队列编排辅助函数。
 *
 * 关键点（中文）
 * - audit / exec 入队都需要走同一套 prepare + emit 流程。
 * - 这些逻辑抽离后，`BaseChatChannel` 只负责渠道层输入整理与授权判断。
 */

import { resolveChatQueueStore } from "@services/chat/runtime/ChatQueue.js";
import { buildQueuedUserMessageWithInfo } from "@services/chat/runtime/QueuedUserMessage.js";
import { appendExecIngress } from "@services/chat/runtime/ChatIngressStore.js";
import { resolveIncomingChatUserRole } from "@services/chat/runtime/PluginDispatch.js";
import {
  emitChatEnqueueEffect,
  prepareChatEnqueue,
} from "@services/chat/runtime/EnqueueDispatch.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { JsonObject } from "@/types/Json.js";
import type { IncomingChatMessage } from "./BaseChatChannel.js";
import {
  appendInboundChannelHistory,
  resolveOrCreateChannelSessionId,
  stripUndefinedMeta,
  type ChannelUserMessageMeta,
  updateChannelChatMeta,
} from "./BaseChatChannelSupport.js";

/**
 * audit 入队输入。
 */
export interface EnqueueAuditChannelMessageParams {
  /**
   * 当前 execution runtime。
   */
  context: ExecutionContext;
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * 平台 chatId。
   */
  chatId: string;
  /**
   * 文本内容。
   */
  text: string;
  /**
   * 可选消息 id。
   */
  messageId?: string;
  /**
   * 可选用户 id。
   */
  userId?: string;
  /**
   * 可选扩展 meta。
   */
  meta?: ChannelUserMessageMeta;
}

/**
 * exec 入队输入。
 */
export interface EnqueueExecChannelMessageParams {
  /**
   * 当前 execution runtime。
   */
  context: ExecutionContext;
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * 标准化后的入站消息。
   */
  message: IncomingChatMessage;
}

/**
 * 写入 audit 消息并送入 chat queue。
 */
export async function enqueueAuditChannelMessage(
  params: EnqueueAuditChannelMessageParams,
): Promise<void> {
  const meta = (params.meta || {}) as ChannelUserMessageMeta;
  const username = typeof meta.username === "string" ? meta.username : undefined;
  const messageThreadId =
    typeof meta.messageThreadId === "number" && Number.isFinite(meta.messageThreadId)
      ? meta.messageThreadId
      : undefined;
  const chatType = typeof meta.chatType === "string" ? meta.chatType : undefined;
  const chatTitle =
    typeof meta.chatTitle === "string" ? meta.chatTitle.trim() || undefined : undefined;
  const sessionId = await resolveOrCreateChannelSessionId({
    context: params.context,
    channel: params.channel,
    chatId: params.chatId,
    chatType,
    messageThreadId,
  });
  if (!sessionId) return;

  const extra = stripUndefinedMeta(meta);
  await appendInboundChannelHistory({
    context: params.context,
    logger: params.context.logger,
    channel: params.channel,
    sessionId,
    chatId: params.chatId,
    ingressKind: "audit",
    text: params.text,
    targetType: chatType,
    threadId: messageThreadId,
    messageId: params.messageId,
    actorId: params.userId,
    actorName: username,
    extra,
  });
  await updateChannelChatMeta({
    context: params.context,
    channel: params.channel,
    sessionId,
    chatId: params.chatId,
    targetType: chatType,
    threadId: messageThreadId,
    messageId: params.messageId,
    actorId: params.userId,
    actorName: username,
    chatTitle,
  });

  const preparedAudit = await prepareChatEnqueue({
    runtime: params.context,
    input: {
      kind: "audit",
      channel: params.channel,
      chatKey: sessionId,
      chatId: params.chatId,
      text: params.text,
      ...(chatType ? { chatType } : {}),
      ...(typeof messageThreadId === "number" ? { threadId: messageThreadId } : {}),
      ...(typeof params.messageId === "string" ? { messageId: params.messageId } : {}),
      ...(typeof params.userId === "string" ? { actorId: params.userId } : {}),
      ...(typeof username === "string" ? { actorName: username } : {}),
      extra,
    },
  });
  const auditEnqueued = resolveChatQueueStore(params.context).enqueue({
    kind: "audit",
    channel: params.channel,
    targetId: params.chatId,
    sessionId,
    ...(typeof preparedAudit.actorId === "string"
      ? { actorId: preparedAudit.actorId }
      : {}),
    ...(typeof preparedAudit.actorName === "string"
      ? { actorName: preparedAudit.actorName }
      : {}),
    ...(typeof preparedAudit.messageId === "string"
      ? { messageId: preparedAudit.messageId }
      : {}),
    text: preparedAudit.text,
    ...(typeof preparedAudit.threadId === "number"
      ? { threadId: preparedAudit.threadId }
      : {}),
    ...(typeof preparedAudit.chatType === "string"
      ? { targetType: preparedAudit.chatType }
      : {}),
    extra:
      preparedAudit.extra && typeof preparedAudit.extra === "object"
        ? (preparedAudit.extra as JsonObject)
        : extra,
  });
  await emitChatEnqueueEffect({
    runtime: params.context,
    input: {
      ...preparedAudit,
      itemId: auditEnqueued.itemId,
      lanePosition: auditEnqueued.lanePosition,
    },
  });
}

/**
 * 写入 exec ingress 并送入 chat queue。
 */
export async function enqueueExecChannelMessage(
  params: EnqueueExecChannelMessageParams,
): Promise<{ chatKey: string; position: number }> {
  const msg = params.message;
  const userRole = await resolveIncomingChatUserRole({
    runtime: params.context,
    channel: params.channel,
    userId: msg.userId,
  });
  const inboundExtra =
    msg.extra && typeof msg.extra === "object" ? stripUndefinedMeta(msg.extra) : {};
  const mergedExtra: JsonObject = {
    ...inboundExtra,
    roleId: userRole?.roleId || "unknown",
    permissions: userRole?.permissions || [],
  };

  const chatKey = await resolveOrCreateChannelSessionId({
    context: params.context,
    channel: params.channel,
    chatId: msg.chatId,
    chatType: msg.chatType,
    messageThreadId: msg.messageThreadId,
  });
  if (!chatKey) {
    throw new Error("Failed to resolve sessionId for incoming chat message");
  }

  const rawQueuedText = buildQueuedUserMessageWithInfo({
    messageId: msg.messageId,
    userId: msg.userId,
    username: msg.username,
    roleId: userRole?.roleId,
    permissions: userRole?.permissions,
    userTimezone: msg.userTimezone,
    text: msg.text,
  });
  const preparedExec = await prepareChatEnqueue({
    runtime: params.context,
    input: {
      kind: "exec",
      channel: params.channel,
      chatKey,
      chatId: msg.chatId,
      text: rawQueuedText,
      ...(msg.chatType ? { chatType: msg.chatType } : {}),
      ...(typeof msg.messageThreadId === "number"
        ? { threadId: msg.messageThreadId }
        : {}),
      ...(typeof msg.messageId === "string" ? { messageId: msg.messageId } : {}),
      ...(typeof msg.userId === "string" ? { actorId: msg.userId } : {}),
      ...(typeof msg.username === "string" ? { actorName: msg.username } : {}),
      extra: mergedExtra,
    },
  });
  const queuedText = preparedExec.text;
  const queuedExtra =
    preparedExec.extra && typeof preparedExec.extra === "object"
      ? (preparedExec.extra as JsonObject)
      : mergedExtra;

  await appendExecIngress({
    context: params.context,
    sessionId: chatKey,
    channel: params.channel,
    chatId: msg.chatId,
    text: queuedText,
    ...(typeof preparedExec.chatType === "string"
      ? { targetType: preparedExec.chatType }
      : {}),
    ...(typeof preparedExec.threadId === "number"
      ? { threadId: preparedExec.threadId }
      : {}),
    ...(typeof preparedExec.messageId === "string"
      ? { messageId: preparedExec.messageId }
      : {}),
    ...(typeof preparedExec.actorId === "string"
      ? { actorId: preparedExec.actorId }
      : {}),
    ...(typeof preparedExec.actorName === "string"
      ? { actorName: preparedExec.actorName }
      : {}),
    extra: queuedExtra,
  });

  await updateChannelChatMeta({
    context: params.context,
    channel: params.channel,
    sessionId: chatKey,
    chatId: msg.chatId,
    targetType: msg.chatType,
    threadId: msg.messageThreadId,
    messageId: msg.messageId,
    actorId: msg.userId,
    actorName: msg.username,
    chatTitle: msg.chatTitle,
  });

  const execEnqueued = resolveChatQueueStore(params.context).enqueue({
    kind: "exec",
    channel: params.channel,
    targetId: msg.chatId,
    sessionId: chatKey,
    text: queuedText,
    ...(typeof preparedExec.chatType === "string"
      ? { targetType: preparedExec.chatType }
      : {}),
    ...(typeof preparedExec.threadId === "number"
      ? { threadId: preparedExec.threadId }
      : {}),
    ...(typeof preparedExec.messageId === "string"
      ? { messageId: preparedExec.messageId }
      : {}),
    ...(typeof preparedExec.actorId === "string"
      ? { actorId: preparedExec.actorId }
      : {}),
    ...(typeof preparedExec.actorName === "string"
      ? { actorName: preparedExec.actorName }
      : {}),
    sessionPersisted: true,
    extra: queuedExtra,
  });
  await emitChatEnqueueEffect({
    runtime: params.context,
    input: {
      ...preparedExec,
      itemId: execEnqueued.itemId,
      lanePosition: execEnqueued.lanePosition,
    },
  });

  return { chatKey, position: execEnqueued.lanePosition };
}
