/**
 * Auth 授权运行时状态存储。
 *
 * 关键点（中文）
 * - 所有动态状态（观测用户 / 会话）统一落盘到 `.downcity/chat/authorization/state.json`。
 * - 静态授权配置保存在 console `downcity.db`，不和运行时观测数据混写。
 */

import fs from "fs-extra";
import path from "node:path";
import type {
  ChatAuthorizationObservedChat,
  ChatAuthorizationObservedUser,
  ChatAuthorizationSnapshot,
  ChatAuthorizationStateFile,
} from "@/types/AuthPlugin.js";
import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import { readChatAuthorizationConfigSync } from "@/plugins/auth/runtime/AuthorizationConfig.js";

function getAuthorizationStatePath(rootPath: string): string {
  return path.join(rootPath, ".downcity", "chat", "authorization", "state.json");
}

function normalizeText(value: unknown): string | undefined {
  const text = String(value || "").trim();
  return text ? text : undefined;
}

function buildUserKey(channel: ChatDispatchChannel, userId: string): string {
  return `${channel}:${userId}`;
}

function buildChatKey(channel: ChatDispatchChannel, chatId: string): string {
  return `${channel}:${chatId}`;
}

function createEmptyState(): ChatAuthorizationStateFile {
  return {
    v: 1,
    updatedAt: Date.now(),
    usersByKey: {},
    chatsByKey: {},
  };
}

function normalizeObservedUser(
  input: Partial<ChatAuthorizationObservedUser> | null | undefined,
): ChatAuthorizationObservedUser | null {
  if (!input || typeof input !== "object") return null;
  const channel = normalizeText(input.channel) as ChatDispatchChannel | undefined;
  const userId = normalizeText(input.userId);
  if (!channel || !userId) return null;
  return {
    v: 1,
    channel,
    userId,
    ...(normalizeText(input.username) ? { username: normalizeText(input.username) } : {}),
    ...(normalizeText(input.lastChatId) ? { lastChatId: normalizeText(input.lastChatId) } : {}),
    ...(normalizeText(input.lastChatTitle)
      ? { lastChatTitle: normalizeText(input.lastChatTitle) }
      : {}),
    ...(normalizeText(input.lastChatType)
      ? { lastChatType: normalizeText(input.lastChatType) }
      : {}),
    firstSeenAt:
      typeof input.firstSeenAt === "number" && Number.isFinite(input.firstSeenAt)
        ? input.firstSeenAt
        : Date.now(),
    lastSeenAt:
      typeof input.lastSeenAt === "number" && Number.isFinite(input.lastSeenAt)
        ? input.lastSeenAt
        : Date.now(),
  };
}

function normalizeObservedChat(
  input: Partial<ChatAuthorizationObservedChat> | null | undefined,
): ChatAuthorizationObservedChat | null {
  if (!input || typeof input !== "object") return null;
  const channel = normalizeText(input.channel) as ChatDispatchChannel | undefined;
  const chatId = normalizeText(input.chatId);
  if (!channel || !chatId) return null;
  return {
    v: 1,
    channel,
    chatId,
    ...(normalizeText(input.chatTitle) ? { chatTitle: normalizeText(input.chatTitle) } : {}),
    ...(normalizeText(input.chatType) ? { chatType: normalizeText(input.chatType) } : {}),
    ...(normalizeText(input.lastActorId)
      ? { lastActorId: normalizeText(input.lastActorId) }
      : {}),
    ...(normalizeText(input.lastActorName)
      ? { lastActorName: normalizeText(input.lastActorName) }
      : {}),
    firstSeenAt:
      typeof input.firstSeenAt === "number" && Number.isFinite(input.firstSeenAt)
        ? input.firstSeenAt
        : Date.now(),
    lastSeenAt:
      typeof input.lastSeenAt === "number" && Number.isFinite(input.lastSeenAt)
        ? input.lastSeenAt
        : Date.now(),
  };
}

function normalizeStateFile(
  input: Partial<ChatAuthorizationStateFile> | null | undefined,
): ChatAuthorizationStateFile {
  const out = createEmptyState();
  out.updatedAt =
    typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt)
      ? input.updatedAt
      : Date.now();

  const users = input?.usersByKey;
  if (users && typeof users === "object") {
    for (const [key, value] of Object.entries(users)) {
      const normalized = normalizeObservedUser(value);
      if (!normalized) continue;
      out.usersByKey[key] = normalized;
    }
  }

  const chats = input?.chatsByKey;
  if (chats && typeof chats === "object") {
    for (const [key, value] of Object.entries(chats)) {
      const normalized = normalizeObservedChat(value);
      if (!normalized) continue;
      out.chatsByKey[key] = normalized;
    }
  }
  return out;
}

async function readState(rootPath: string): Promise<ChatAuthorizationStateFile> {
  const file = getAuthorizationStatePath(rootPath);
  const raw = (await fs.readJson(file).catch(() => null)) as Partial<ChatAuthorizationStateFile> | null;
  return normalizeStateFile(raw);
}

async function writeState(rootPath: string, state: ChatAuthorizationStateFile): Promise<void> {
  const file = getAuthorizationStatePath(rootPath);
  await fs.ensureDir(path.dirname(file));
  await fs.writeJson(file, state, { spaces: 2 });
}

function readAuthorizationConfig(projectRoot: string): ChatAuthorizationSnapshot["config"] {
  return readChatAuthorizationConfigSync(projectRoot);
}

/**
 * 记录观测到的用户 / 会话。
 */
export async function recordObservedAuthorizationPrincipal(params: {
  context: Pick<ExecutionContext, "rootPath">;
  channel: ChatDispatchChannel;
  chatId: string;
  chatType?: string;
  chatTitle?: string;
  userId?: string;
  username?: string;
}): Promise<void> {
  const chatId = normalizeText(params.chatId);
  if (!chatId) return;
  const now = Date.now();
  const state = await readState(params.context.rootPath);

  const chatKey = buildChatKey(params.channel, chatId);
  const prevChat = state.chatsByKey[chatKey];
  state.chatsByKey[chatKey] = {
    v: 1,
    channel: params.channel,
    chatId,
    ...(normalizeText(params.chatTitle) ? { chatTitle: normalizeText(params.chatTitle) } : {}),
    ...(normalizeText(params.chatType) ? { chatType: normalizeText(params.chatType) } : {}),
    ...(normalizeText(params.userId) ? { lastActorId: normalizeText(params.userId) } : {}),
    ...(normalizeText(params.username) ? { lastActorName: normalizeText(params.username) } : {}),
    firstSeenAt: prevChat?.firstSeenAt ?? now,
    lastSeenAt: now,
  };

  const userId = normalizeText(params.userId);
  if (userId) {
    const userKey = buildUserKey(params.channel, userId);
    const prevUser = state.usersByKey[userKey];
    state.usersByKey[userKey] = {
      v: 1,
      channel: params.channel,
      userId,
      ...(normalizeText(params.username) ? { username: normalizeText(params.username) } : {}),
      lastChatId: chatId,
      ...(normalizeText(params.chatTitle)
        ? { lastChatTitle: normalizeText(params.chatTitle) }
        : {}),
      ...(normalizeText(params.chatType) ? { lastChatType: normalizeText(params.chatType) } : {}),
      firstSeenAt: prevUser?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
  }

  state.updatedAt = now;
  await writeState(params.context.rootPath, state);
}

/**
 * 读取授权快照（配置 + 动态状态）。
 */
export async function readAuthorizationSnapshot(params: {
  context: Pick<ExecutionContext, "rootPath">;
}): Promise<ChatAuthorizationSnapshot> {
  const state = await readState(params.context.rootPath);
  return {
    config: readAuthorizationConfig(params.context.rootPath),
    users: Object.values(state.usersByKey).sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    chats: Object.values(state.chatsByKey).sort((a, b) => b.lastSeenAt - a.lastSeenAt),
  };
}
