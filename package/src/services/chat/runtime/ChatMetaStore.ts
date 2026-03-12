/**
 * ChatMetaStore：按 contextId 维护 chat 路由元信息。
 *
 * 关键点（中文）
 * - 入站消息到达时由 services/chat 写入
 * - 出站按 contextId/chatKey 发送时由 services/chat 读取
 * - 与 core context messages 解耦，避免平台细节下沉到 core
 */

import fs from "fs-extra";
import { getShipChatMetaDirPath, getShipChatMetaPath } from "@/console/env/Paths.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { ChatMetaV1 } from "@services/chat/types/ChatMeta.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

function normalizeContextId(contextId: string): string {
  return String(contextId || "").trim();
}

function normalizeChatId(chatId: string): string {
  return String(chatId || "").trim();
}

/**
 * 读取指定 contextId 的 chat meta。
 */
export async function readChatMetaByContextId(params: {
  context: ServiceRuntime;
  contextId: string;
}): Promise<ChatMetaV1 | null> {
  const rootPath = String(params.context.rootPath || "").trim();
  const contextId = normalizeContextId(params.contextId);
  if (!rootPath || !contextId) return null;

  const file = getShipChatMetaPath(rootPath, contextId);
  try {
    const raw = (await fs.readJson(file)) as Partial<ChatMetaV1> | null;
    if (!raw || typeof raw !== "object") return null;
    const channel = raw.channel;
    const chatId = normalizeChatId(String(raw.chatId || ""));
    if (!channel || !chatId) return null;
    return {
      v: 1,
      updatedAt:
        typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
          ? raw.updatedAt
          : 0,
      contextId,
      channel,
      chatId,
      ...(typeof raw.targetType === "string" && raw.targetType.trim()
        ? { targetType: raw.targetType.trim() }
        : {}),
      ...(typeof raw.threadId === "number" && Number.isFinite(raw.threadId)
        ? { threadId: raw.threadId }
        : {}),
      ...(typeof raw.messageId === "string" && raw.messageId.trim()
        ? { messageId: raw.messageId.trim() }
        : {}),
      ...(typeof raw.actorId === "string" && raw.actorId.trim()
        ? { actorId: raw.actorId.trim() }
        : {}),
      ...(typeof raw.actorName === "string" && raw.actorName.trim()
        ? { actorName: raw.actorName.trim() }
        : {}),
    };
  } catch {
    return null;
  }
}

/**
 * 更新指定 contextId 的 chat meta（全量覆盖最近快照）。
 */
export async function upsertChatMetaByContextId(params: {
  context: ServiceRuntime;
  contextId: string;
  channel: ChatDispatchChannel;
  chatId: string;
  targetType?: string;
  threadId?: number;
  messageId?: string;
  actorId?: string;
  actorName?: string;
}): Promise<void> {
  const rootPath = String(params.context.rootPath || "").trim();
  const contextId = normalizeContextId(params.contextId);
  const chatId = normalizeChatId(params.chatId);
  if (!rootPath || !contextId || !chatId) return;

  const dir = getShipChatMetaDirPath(rootPath);
  const file = getShipChatMetaPath(rootPath, contextId);
  const payload: ChatMetaV1 = {
    v: 1,
    updatedAt: Date.now(),
    contextId,
    channel: params.channel,
    chatId,
    ...(typeof params.targetType === "string" && params.targetType.trim()
      ? { targetType: params.targetType.trim() }
      : {}),
    ...(typeof params.threadId === "number" && Number.isFinite(params.threadId)
      ? { threadId: params.threadId }
      : {}),
    ...(typeof params.messageId === "string" && params.messageId.trim()
      ? { messageId: params.messageId.trim() }
      : {}),
    ...(typeof params.actorId === "string" && params.actorId.trim()
      ? { actorId: params.actorId.trim() }
      : {}),
    ...(typeof params.actorName === "string" && params.actorName.trim()
      ? { actorName: params.actorName.trim() }
      : {}),
  };

  try {
    await fs.ensureDir(dir);
    await fs.writeJson(file, payload, { spaces: 2 });
  } catch {
    // ignore
  }
}
