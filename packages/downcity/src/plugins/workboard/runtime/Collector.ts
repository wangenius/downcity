/**
 * Workboard 快照采集器。
 *
 * 关键点（中文）
 * - 这里只做确定性采集，不引入 LLM 推理。
 * - 当前聚合 session、task、service 三类运行事实，先满足“当前在做什么 + 最近做过什么”。
 */

import { listTaskDefinitions } from "@services/task/Action.js";
import { listServiceStates } from "@/main/service/Manager.js";
import { listDashboardSessionSummaries } from "@/main/modules/http/dashboard/SessionSummaryStore.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { WorkboardSnapshot } from "@/plugins/workboard/types/Workboard.js";
import {
  buildIdleActivity,
  toWorkboardAgentSummary,
  toWorkboardServiceItems,
  toWorkboardSessionActivity,
  toWorkboardSummary,
  toWorkboardTaskSummary,
} from "@/plugins/workboard/runtime/Normalizer.js";

const WORKBOARD_RECENT_LIMIT = 8;

/**
 * 采集当前 workboard 快照。
 */
export async function collectWorkboardSnapshot(
  context: AgentContext,
): Promise<WorkboardSnapshot> {
  const collectedAt = new Date().toISOString();
  const executingSessionIds = new Set(context.session.listExecutingSessionIds());
  const sessions = await listDashboardSessionSummaries({
    projectRoot: context.rootPath,
    executionContext: context,
    limit: WORKBOARD_RECENT_LIMIT + Math.max(executingSessionIds.size, 1),
    executingSessionIds,
  });
  const services = toWorkboardServiceItems(listServiceStates());
  const tasks = toWorkboardTaskSummary(
    await listTaskDefinitions({ projectRoot: context.rootPath }),
  );

  const current = sessions
    .filter((item) => item.executing === true)
    .slice(0, 4)
    .map((item) => toWorkboardSessionActivity({ item, status: "running" }));
  const recent = sessions
    .filter((item) => item.executing !== true)
    .slice(0, WORKBOARD_RECENT_LIMIT)
    .map((item) => toWorkboardSessionActivity({ item, status: "done" }));

  const safeCurrent = current.length > 0
    ? current
    : [buildIdleActivity({ updatedAt: collectedAt, recentFirstTitle: recent[0]?.title })];

  return {
    agent: toWorkboardAgentSummary({
      context,
      collectedAt,
      executingSessionCount: current.length,
      recentFirstTitle: recent[0]?.title,
    }),
    summary: toWorkboardSummary({
      currentCount: current.length,
      recentCount: recent.length,
      services,
    }),
    current: safeCurrent,
    recent,
    services,
    tasks,
  };
}
