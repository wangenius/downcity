/**
 * ChatHistory 类型定义。
 *
 * 关键点（中文）
 * - chat history 是聊天平台事件流（审计向），与 context message history 分离。
 * - 当前先定义入站事件（inbound），用于记录所有收到的消息（audit/exec）。
 */

import type { JsonObject } from "@/types/Json.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

export type ChatHistoryIngressKind = "audit" | "exec";

export type ChatHistoryInboundEventV1 = {
  v: 1;
  id: string;
  ts: number;
  direction: "inbound";
  ingressKind: ChatHistoryIngressKind;
  contextId: string;
  channel: ChatDispatchChannel;
  chatId: string;
  text: string;
  targetType?: string;
  threadId?: number;
  messageId?: string;
  actorId?: string;
  actorName?: string;
  extra?: JsonObject;
};

