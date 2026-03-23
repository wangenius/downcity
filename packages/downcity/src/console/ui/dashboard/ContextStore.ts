/**
 * Dashboard 上下文数据读取 helper。
 *
 * 关键点（中文）
 * - 负责上下文列表聚合。
 * - 只返回 dashboard 视图需要的摘要字段。
 */

import fs from "fs-extra";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import {
  getShipContextMessagesPath,
  getShipContextRootDirPath,
} from "@/console/env/Paths.js";
import { readChatMetaByContextId } from "@services/chat/runtime/ChatMetaStore.js";
import type { DashboardContextSummary } from "@/types/DashboardData.js";
import { decodeMaybe, truncateText } from "./CommonHelpers.js";
import { loadContextMessagesFromFile, resolveUiMessagePreview } from "./MessageTimeline.js";

/**
 * 枚举上下文摘要。
 */
export async function listContextSummaries(params: {
  projectRoot: string;
  serviceRuntime?: ServiceRuntime;
  limit: number;
  executingContextIds?: Set<string>;
}): Promise<DashboardContextSummary[]> {
  const rootDir = getShipContextRootDirPath(params.projectRoot);
  if (!(await fs.pathExists(rootDir))) return [];

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const items: DashboardContextSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const contextId = decodeMaybe(entry.name);
    if (!contextId) continue;

    const filePath = getShipContextMessagesPath(params.projectRoot, contextId);
    const messages = await loadContextMessagesFromFile(filePath);
    const last = messages.at(-1);
    const lastTs =
      typeof last?.metadata?.ts === "number" ? last.metadata.ts : undefined;
    const stat = await fs
      .stat(filePath)
      .then((s) => s)
      .catch(() => null);
    const updatedAt = lastTs || (stat ? stat.mtimeMs : undefined);
    const chatMeta = params.serviceRuntime
      ? await readChatMetaByContextId({
          context: params.serviceRuntime,
          contextId,
        })
      : null;

    items.push({
      contextId,
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
      ...(params.executingContextIds?.has(contextId) ? { executing: true } : {}),
    });
  }

  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return items.slice(0, params.limit);
}
