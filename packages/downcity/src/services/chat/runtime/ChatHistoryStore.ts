/**
 * ChatHistoryStore：聊天事件流持久化。
 *
 * 关键点（中文）
 * - 写入 `.downcity/chat/<sessionId>/history.jsonl`（append-only）。
 * - 记录 inbound（audit/exec）与 outbound 事件。
 * - 与 session message history 分离，避免审计噪声进入模型上下文。
 */

import fs from "fs-extra";
import path from "node:path";
import { generateId } from "@shared/utils/Id.js";
import type { ExecutionContext } from "@/shared/types/ExecutionContext.js";
import type { JsonObject } from "@/shared/types/Json.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import type {
  ChatHistoryDirection,
  ChatHistoryInboundEventV1,
  ChatHistoryEventV1,
  ChatHistoryOutboundEventV1,
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
  sessionId: string;
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
    sessionId: params.sessionId,
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

function buildOutboundEvent(params: {
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
}): ChatHistoryOutboundEventV1 {
  return {
    v: 1,
    id: `chat:${generateId()}`,
    ts: Date.now(),
    direction: "outbound",
    sessionId: params.sessionId,
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

function isValidHistoryDirection(value: unknown): value is ChatHistoryDirection {
  return value === "inbound" || value === "outbound";
}

function isChatHistoryEventV1(value: unknown): value is ChatHistoryEventV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (obj.v !== 1) return false;
  if (!isValidHistoryDirection(obj.direction)) return false;
  if (typeof obj.id !== "string" || !obj.id.trim()) return false;
  if (typeof obj.sessionId !== "string" || !obj.sessionId.trim()) return false;
  if (typeof obj.channel !== "string" || !obj.channel.trim()) return false;
  if (typeof obj.chatId !== "string" || !obj.chatId.trim()) return false;
  if (typeof obj.text !== "string") return false;
  if (typeof obj.ts !== "number" || !Number.isFinite(obj.ts)) return false;
  if (obj.direction === "inbound") {
    const ingressKind = obj.ingressKind;
    if (ingressKind !== "audit" && ingressKind !== "exec") return false;
  }
  return true;
}

/**
 * 追加一条入站 chat 事件。
 *
 * 关键点（中文）
 * - 该函数只做落盘，不做业务判定。
 * - 调用方应在入队前调用，以满足“先审计后执行”链路。
 */
export async function appendInboundChatHistory(params: {
  context: ExecutionContext;
  sessionId: string;
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
  const sessionId = normalizeTrimmedString(params.sessionId);
  const chatId = normalizeTrimmedString(params.chatId);
  if (!rootPath || !sessionId || !chatId) return;

  const event = buildInboundEvent({
    sessionId,
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

  const file = params.context.paths.getDowncityChatHistoryPath(sessionId);
  await fs.ensureDir(path.dirname(file));
  await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
}

/**
 * 追加一条出站 chat 事件。
 *
 * 关键点（中文）
 * - 用于记录机器人主动发出的消息，便于后续审计与回放。
 * - 该函数只做落盘，不影响实际发送链路。
 */
export async function appendOutboundChatHistory(params: {
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
  const rootPath = normalizeTrimmedString(params.context.rootPath);
  const sessionId = normalizeTrimmedString(params.sessionId);
  const chatId = normalizeTrimmedString(params.chatId);
  if (!rootPath || !sessionId || !chatId) return;

  const event = buildOutboundEvent({
    sessionId,
    channel: params.channel,
    chatId,
    text: String(params.text ?? ""),
    targetType: toOptionalTrimmedString(params.targetType),
    threadId: toOptionalFiniteNumber(params.threadId),
    messageId: toOptionalTrimmedString(params.messageId),
    actorId: toOptionalTrimmedString(params.actorId),
    actorName: toOptionalTrimmedString(params.actorName),
    extra: toOptionalObject(params.extra),
  });

  const file = params.context.paths.getDowncityChatHistoryPath(sessionId);
  await fs.ensureDir(path.dirname(file));
  await fs.appendFile(file, JSON.stringify(event) + "\n", "utf8");
}

/**
 * 读取 chat 历史事件（按 sessionId）。
 *
 * 关键点（中文）
 * - 默认返回最近 N 条（按时间升序）。
 * - 仅做文件读取与过滤，不涉及任何业务 side-effect。
 */
export async function readChatHistory(params: {
  context: ExecutionContext;
  sessionId: string;
  limit?: number;
  direction?: ChatHistoryDirection | "all";
  beforeTs?: number;
  afterTs?: number;
}): Promise<{ historyPath: string; events: ChatHistoryEventV1[] }> {
  const rootPath = normalizeTrimmedString(params.context.rootPath);
  const sessionId = normalizeTrimmedString(params.sessionId);
  const historyPath = params.context.paths.getDowncityChatHistoryPath(sessionId);
  if (!rootPath || !sessionId) {
    return {
      historyPath,
      events: [],
    };
  }

  const exists = await fs.pathExists(historyPath);
  if (!exists) {
    return {
      historyPath,
      events: [],
    };
  }

  const limitRaw =
    typeof params.limit === "number" && Number.isFinite(params.limit)
      ? Math.floor(params.limit)
      : 30;
  const limit = Math.max(1, Math.min(limitRaw, 500));
  const direction =
    params.direction === "inbound" || params.direction === "outbound"
      ? params.direction
      : "all";
  const beforeTs =
    typeof params.beforeTs === "number" && Number.isFinite(params.beforeTs)
      ? params.beforeTs
      : undefined;
  const afterTs =
    typeof params.afterTs === "number" && Number.isFinite(params.afterTs)
      ? params.afterTs
      : undefined;

  const content = await fs.readFile(historyPath, "utf8");
  const out: ChatHistoryEventV1[] = [];
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isChatHistoryEventV1(parsed)) continue;
    if (direction !== "all" && parsed.direction !== direction) continue;
    if (typeof beforeTs === "number" && parsed.ts >= beforeTs) continue;
    if (typeof afterTs === "number" && parsed.ts <= afterTs) continue;
    out.push(parsed);
  }

  return {
    historyPath,
    events: out.slice(-limit),
  };
}
