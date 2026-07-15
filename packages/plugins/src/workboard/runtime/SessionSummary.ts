/**
 * Workboard session 摘要采集。
 *
 * 关键点（中文）
 * - workboard 只需要模糊运行态，不复用 downcity control 视图模型。
 * - 这里只读取消息数量、更新时间与执行中状态，不暴露消息内容。
 */

import type { AgentContext } from "@downcity/agent";

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
  const page = await params.context.sessions.list({
    limit: Math.max(1, params.limit),
  });
  return page.items.map((item) => ({
    sessionId: item.sessionId,
    messageCount: item.messageCount,
    ...(typeof item.updatedAt === "number" ? { updatedAt: item.updatedAt } : {}),
    ...(item.executing || params.executingSessionIds?.has(item.sessionId)
      ? { executing: true }
      : {}),
  }));
}
