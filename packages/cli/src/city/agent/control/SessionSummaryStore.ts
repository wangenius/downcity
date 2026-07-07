/**
 * Control 会话摘要读取 helper。
 *
 * 关键点（中文）
 * - 负责会话列表聚合。
 * - 只返回控制面视图需要的摘要字段。
 */

import fs from "fs-extra";
import {
  getDowncitySessionMessagesPath,
  getDowncitySessionRootDirPath,
} from "@/city/config/Paths.js";
import type { ControlSessionSummary } from "@/city/agent/control/types/ControlViewData.js";
import { decodeMaybe, truncateText } from "@/city/agent/control/CommonHelpers.js";
import {
  loadSessionMessagesFromFile,
  resolveUiMessagePreview,
  toUiMessageTimeline,
} from "@/city/agent/control/MessageTimeline.js";

/**
 * 枚举控制面所需的 session 摘要。
 */
export async function listControlSessionSummaries(params: {
  projectRoot: string;
  agentId: string;
  limit: number;
  executingSessionIds?: Set<string>;
}): Promise<ControlSessionSummary[]> {
  const rootDir = getDowncitySessionRootDirPath(
    params.projectRoot,
    params.agentId,
  );
  if (!(await fs.pathExists(rootDir))) return [];

  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const items: ControlSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionId = decodeMaybe(entry.name);
    if (!sessionId) continue;

    const filePath = getDowncitySessionMessagesPath(
      params.projectRoot,
      params.agentId,
      sessionId,
    );
    const messages = await loadSessionMessagesFromFile(filePath);
    const last = [...messages]
      .reverse()
      .find((message) => toUiMessageTimeline(message).length > 0);
    const lastTs =
      typeof last?.metadata?.ts === "number" ? last.metadata.ts : undefined;
    const stat = await fs
      .stat(filePath)
      .then((s) => s)
      .catch(() => null);
    const updatedAt = lastTs || (stat ? stat.mtimeMs : undefined);

    items.push({
      sessionId,
      messageCount: messages.length,
      ...(typeof updatedAt === "number" ? { updatedAt } : {}),
      ...(last?.role ? { lastRole: last.role } : {}),
      ...(last
        ? { lastText: truncateText(resolveUiMessagePreview(last), 180) }
        : {}),
      ...(params.executingSessionIds?.has(sessionId) ? { executing: true } : {}),
    });
  }

  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return items.slice(0, params.limit);
}
