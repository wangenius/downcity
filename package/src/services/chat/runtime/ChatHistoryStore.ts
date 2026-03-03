/**
 * ChatHistoryStore：聊天事件流持久化。
 *
 * 关键点（中文）
 * - 写入 `.ship/chat/<contextId>/history.jsonl`（append-only）。
 * - 当前主要记录 inbound（audit/exec）事件。
 * - 与 context message history 分离，避免审计噪声进入模型上下文。
 */

import fs from "fs-extra";
import path from "node:path";
import { generateId } from "@main/utils/Id.js";
import { getShipChatHistoryPath } from "@/main/runtime/Paths.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import type {
  ChatHistoryInboundEventV1,
  ChatHistoryIngressKind,
} from "@services/chat/types/ChatHistory.js";

function normalizeTrimmedString(value: string | undefined): string {
  return String(value || "").trim();
}

function toOptionalTrimmedString(value: string | undefined): string | undefined {
  const out = normalizeTrimmedString(value);
  return out ? out : undefined;
}

function toOptionalFiniteNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toOptionalObject(value: JsonObject | undefined): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value;
}

function buildInboundEvent(params: {
  contextId: string;
  channel: ChatDispatchChannel;
  chatId: string;
  ingressKind: ChatHistoryIngressKind;
  text: string;
  targetType?: string;
  threadId?: number;
  messageId?: string;
  actorId?: string;
  actorName?: string;
  extra?: JsonObject;
}): ChatHistoryInboundEventV1 {
  return {
    v: 1,
    id: `chat:${generateId()}`,
    ts: Date.now(),
    direction: "inbound",
    ingressKind: params.ingressKind,
    contextId: params.contextId,
    channel: params.channel,
    chatId: params.chatId,
    text: params.text,
    ...(params.targetType ? { targetType: params.targetType } : {}),
    ...(typeof params.threadId === "number" ? { threadId: params.threadId } : {}),
    ...(params.messageId ? { messageId: params.messageId } : {}),
    ...(params.actorId ? { actorId: params.actorId } : {}),
    ...(params.actorName ? { actorName: params.actorName } : {}),
    ...(params.extra ? { extra: params.extra } : {}),
  };
}

/**
 * 追加一条入站 chat 事件。
 *
 * 关键点（中文）
 * - 该函数只做落盘，不做业务判定。
 * - 调用方应在入队前调用，以满足“先审计后执行”链路。
 */
export async function appendInboundChatHistory(params: {
  context: ServiceRuntime;
  contextId: string;
  channel: ChatDispatchChannel;
  chatId: string;
  ingressKind: ChatHistoryIngressKind;
  text: string;
  targetType?: string;
  threadId?: number;
  messageId?: string;
  actorId?: string;
  actorName?: string;
  extra?: JsonObject;
}): Promise<void> {
  const rootPath = normalizeTrimmedString(params.context.rootPath);
  const contextId = normalizeTrimmedString(params.contextId);
  const chatId = normalizeTrimmedString(params.chatId);
  if (!rootPath || !contextId || !chatId) return;

  const event = buildInboundEvent({
    contextId,
    channel: params.channel,
    chatId,
    ingressKind: params.ingressKind,
    text: String(params.text ?? ""),
    targetType: toOptionalTrimmedString(params.targetType),
    threadId: toOptionalFiniteNumber(params.threadId),
    messageId: toOptionalTrimmedString(params.messageId),
    actorId: toOptionalTrimmedString(params.actorId),
    actorName: toOptionalTrimmedString(params.actorName),
    extra: toOptionalObject(params.extra),
  });

  const file = getShipChatHistoryPath(rootPath, contextId);
  await fs.ensureDir(path.dirname(file));
  await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
}
