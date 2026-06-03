/**
 * Workboard session 摘要采集。
 *
 * 关键点（中文）
 * - workboard 只需要模糊运行态，不复用 Town control 视图模型。
 * - 这里只读取消息数量、更新时间与执行中状态，不暴露消息内容。
 */

import fs from "fs-extra";
import path from "node:path";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";

/**
 * Workboard 内部 session 摘要。
 */
export interface WorkboardSessionSummary {
  /**
   * session 稳定标识，仅供内部排序和执行态匹配使用，不会进入公开输出。
   */
  sessionId: string;
  /**
   * 当前 session 消息数量。
   */
  messageCount: number;
  /**
   * 最近更新时间戳。
   */
  updatedAt?: number;
  /**
   * 当前 session 是否仍在执行。
   */
  executing?: boolean;
}

/**
 * 采集 workboard 需要的 session 摘要。
 */
export async function listWorkboardSessionSummaries(params: {
  /**
   * Agent runtime context。
   */
  context: AgentContext;
  /**
   * 返回上限。
   */
  limit: number;
  /**
   * 正在执行的 session id 集合。
   */
  executingSessionIds?: Set<string>;
}): Promise<WorkboardSessionSummary[]> {
  const root_dir = params.context.paths.getDowncitySessionRootDirPath();
  if (!(await fs.pathExists(root_dir))) return [];

  const entries = await fs.readdir(root_dir, { withFileTypes: true });
  const items: WorkboardSessionSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const session_id = decodeMaybe(entry.name);
    if (!session_id) continue;
    const messages_path = path.join(
      params.context.paths.getDowncitySessionDirPath(session_id),
      "messages",
      "messages.jsonl",
    );
    const stat = await fs.stat(messages_path).catch(() => null);
    items.push({
      sessionId: session_id,
      messageCount: await countJsonlLines(messages_path),
      ...(stat ? { updatedAt: stat.mtimeMs } : {}),
      ...(params.executingSessionIds?.has(session_id) ? { executing: true } : {}),
    });
  }

  items.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return items.slice(0, Math.max(1, params.limit));
}

async function countJsonlLines(file_path: string): Promise<number> {
  const raw = await fs.readFile(file_path, "utf-8").catch(() => "");
  if (!raw) return 0;
  return raw.split("\n").filter((line) => line.trim()).length;
}

function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(String(value || "")).trim();
  } catch {
    return String(value || "").trim();
  }
}
