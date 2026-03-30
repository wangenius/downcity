/**
 * Dashboard 会话数据读取 helper。
 *
 * 关键点（中文）
 * - 负责会话列表聚合。
 * - 只返回 dashboard 视图需要的摘要字段。
 */

import fs from "fs-extra";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import {
  getDowncitySessionMessagesPath,
  getDowncitySessionRootDirPath,
} from "@/main/env/Paths.js";
import { readChatMetaBySessionId } from "@services/chat/runtime/ChatMetaStore.js";
import type { DashboardSessionSummary } from "@/types/DashboardData.js";
import { decodeMaybe, truncateText } from "./CommonHelpers.js";
import { loadSessionMessagesFromFile, resolveUiMessagePreview } from "./MessageTimeline.js";

/**
 * 枚举 session 摘要。
 */
export async function listSessionSummaries(params: {
  projectRoot: string;
  executionRuntime?: ExecutionRuntime;
  limit: number;
  executingSessionIds?: Set<string>;
}): Promise<DashboardSessionSummary[]> {
  const rootDir = getDowncitySessionRootDirPath(params.projectRoot);
  if (!(await fs.pathExists(rootDir))) return [];

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const items: DashboardSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionId = decodeMaybe(entry.name);
    if (!sessionId) continue;

    const filePath = getDowncitySessionMessagesPath(params.projectRoot, sessionId);
    const messages = await loadSessionMessagesFromFile(filePath);
    const last = messages.at(-1);
    const lastTs =
      typeof last?.metadata?.ts === "number" ? last.metadata.ts : undefined;
    const stat = await fs
      .stat(filePath)
      .then((s) => s)
      .catch(() => null);
    const updatedAt = lastTs || (stat ? stat.mtimeMs : undefined);
    const chatMeta = params.executionRuntime
      ? await readChatMetaBySessionId({
          context: params.executionRuntime,
          sessionId,
        })
      : null;

    items.push({
      sessionId,
      messageCount: messages.length,
      ...(typeof updatedAt === "number" ? { updatedAt } : {}),
      ...(last?.role ? { lastRole: last.role } : {}),
      ...(last
        ? { lastText: truncateText(resolveUiMessagePreview(last), 180) }
        : {}),
      ...(typeof chatMeta?.channel === "string" ? { channel: chatMeta.channel } : {}),
      ...(typeof chatMeta?.chatId === "string" ? { chatId: chatMeta.chatId } : {}),
      ...(typeof chatMeta?.chatTitle === "string" ? { chatTitle: chatMeta.chatTitle } : {}),
      ...(typeof chatMeta?.targetType === "string" ? { chatType: chatMeta.targetType } : {}),
      ...(typeof chatMeta?.threadId === "number" ? { threadId: chatMeta.threadId } : {}),
      ...(params.executingSessionIds?.has(sessionId) ? { executing: true } : {}),
    });
  }

  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return items.slice(0, params.limit);
}
