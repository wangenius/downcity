/**
 * Workboard 快照采集器。
 *
 * 关键点（中文）
 * - 这里只做确定性采集，不引入 LLM 推理。
 * - 内部仍聚合 session、task、service 三类运行事实，但最终只输出对外安全的模糊状态。
 */

import { listTaskDefinitions } from "@services/task/Action.js";
import { listServiceStates } from "@/main/service/Manager.js";
import { listDashboardSessionSummaries } from "@/main/modules/http/dashboard/SessionSummaryStore.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { WorkboardSnapshot } from "@/plugins/workboard/types/Workboard.js";
import {
  buildIdleActivity,
  toRecentActivity,
  toRunningActivity,
  toWorkboardAgentSummary,
  toWorkboardSignals,
  toWorkboardSummary,
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
  const services = listServiceStates();
  const taskResult = await listTaskDefinitions({ projectRoot: context.rootPath });
  const degradedCount = services.filter((item) => item.state !== "running").length;

  const current = sessions
    .filter((item) => item.executing === true)
    .slice(0, 4)
    .map((item, index) => toRunningActivity({ item, index }));
  const recent = sessions
    .filter((item) => item.executing !== true)
    .slice(0, WORKBOARD_RECENT_LIMIT)
    .map((item, index) => toRecentActivity({ item, index }));

  const safeCurrent = current.length > 0
    ? current
    : [buildIdleActivity({ updatedAt: collectedAt, recentCount: recent.length })];

  return {
    agent: toWorkboardAgentSummary({
      context,
      collectedAt,
      currentCount: current.length,
      recentCount: recent.length,
      degradedCount,
    }),
    summary: toWorkboardSummary({
      currentCount: current.length,
      recentCount: recent.length,
      degradedCount,
    }),
    current: safeCurrent,
    recent,
    signals: toWorkboardSignals({
      currentCount: current.length,
      recentCount: recent.length,
      services,
      taskResult,
    }),
  };
}
