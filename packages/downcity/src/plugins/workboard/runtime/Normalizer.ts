/**
 * Workboard 结构化归一化工具。
 *
 * 关键点（中文）
 * - collector 只负责取数，这里统一把原始运行态映射成 workboard 视图结构。
 * - 所有对 UI 友好的标题、摘要、标签都在这里生成，避免 collector 继续膨胀。
 */

import type { DashboardSessionSummary } from "@/shared/types/DashboardData.js";
import type { ServiceStateSnapshot } from "@/shared/types/ServiceState.js";
import type { TaskListResponse } from "@services/task/types/TaskCommand.js";
import type {
  WorkboardActivityItem,
  WorkboardAgentSummary,
  WorkboardServiceItem,
  WorkboardSummary,
  WorkboardTaskSummary,
} from "@/plugins/workboard/types/Workboard.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";

function toIsoString(timestamp?: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return new Date().toISOString();
  }
  return new Date(timestamp).toISOString();
}

/**
 * 读取 agent 执行模式。
 */
export function readWorkboardExecutionMode(context: AgentContext): string {
  const execution = context.config.execution;
  if (execution && typeof execution.type === "string" && execution.type.trim()) {
    return execution.type.trim();
  }
  return "unknown";
}

/**
 * 读取 agent 主模型标识。
 */
export function readWorkboardModelId(context: AgentContext): string | undefined {
  const execution = context.config.execution;
  if (
    execution &&
    execution.type === "api" &&
    typeof execution.modelId === "string" &&
    execution.modelId.trim()
  ) {
    return execution.modelId.trim();
  }
  const localModel = context.config.plugins?.lmp?.model;
  if (typeof localModel === "string" && localModel.trim()) {
    return localModel.trim();
  }
  return undefined;
}

/**
 * 构建 agent 顶部摘要。
 */
export function toWorkboardAgentSummary(params: {
  context: AgentContext;
  collectedAt: string;
  executingSessionCount: number;
  recentFirstTitle?: string;
}): WorkboardAgentSummary {
  const statusText = params.executingSessionCount > 0
    ? `正在处理 ${params.executingSessionCount} 个会话`
    : params.recentFirstTitle
      ? `当前空闲，最近完成：${params.recentFirstTitle}`
      : "当前空闲，等待新任务";

  return {
    id: params.context.rootPath,
    name: String(params.context.config.name || "").trim() || "agent",
    projectRoot: params.context.rootPath,
    executionMode: readWorkboardExecutionMode(params.context),
    ...(readWorkboardModelId(params.context)
      ? { modelId: readWorkboardModelId(params.context) }
      : {}),
    running: true,
    statusText,
    collectedAt: params.collectedAt,
  };
}

/**
 * 将 session 摘要转换为 workboard 活动项。
 */
export function toWorkboardSessionActivity(params: {
  item: DashboardSessionSummary;
  status: "running" | "done";
}): WorkboardActivityItem {
  const title =
    String(params.item.chatTitle || "").trim() ||
    String(params.item.channel || "").trim() ||
    String(params.item.sessionId || "").trim() ||
    "session";
  const summary =
    String(params.item.lastText || "").trim() ||
    (params.status === "running" ? "正在处理中" : "暂无可展示摘要");
  const tags = [
    String(params.item.channel || "").trim(),
    typeof params.item.messageCount === "number" ? `${params.item.messageCount} messages` : "",
  ].filter(Boolean);

  return {
    id: `session:${params.item.sessionId}`,
    kind: "session",
    title,
    summary,
    status: params.status,
    updatedAt: toIsoString(params.item.updatedAt),
    ...(params.item.updatedAt ? { startedAt: toIsoString(params.item.updatedAt) } : {}),
    sessionId: String(params.item.sessionId || "").trim(),
    tags,
  };
}

/**
 * 构建空闲占位项。
 */
export function buildIdleActivity(params: {
  updatedAt: string;
  recentFirstTitle?: string;
}): WorkboardActivityItem {
  return {
    id: "system:idle",
    kind: "system",
    title: "当前没有执行中的会话",
    summary: params.recentFirstTitle
      ? `最近完成的是 ${params.recentFirstTitle}`
      : "等待新的输入、任务或调度触发",
    status: "idle",
    updatedAt: params.updatedAt,
    tags: ["idle"],
  };
}

/**
 * 构建 service 摘要。
 */
export function toWorkboardServiceItems(
  items: ServiceStateSnapshot[],
): WorkboardServiceItem[] {
  return items.map((item) => ({
    name: item.name,
    state: item.state,
    updatedAt: toIsoString(item.updatedAt),
    ...(item.lastError ? { lastError: item.lastError } : {}),
  }));
}

/**
 * 构建 task 聚合摘要。
 */
export function toWorkboardTaskSummary(result: TaskListResponse): WorkboardTaskSummary {
  const tasks = Array.isArray(result.tasks) ? result.tasks : [];
  return {
    total: tasks.length,
    enabled: tasks.filter((item) => item.status === "enabled").length,
    paused: tasks.filter((item) => item.status === "paused").length,
    disabled: tasks.filter((item) => item.status === "disabled").length,
  };
}

/**
 * 构建顶部摘要。
 */
export function toWorkboardSummary(params: {
  currentCount: number;
  recentCount: number;
  services: WorkboardServiceItem[];
}): WorkboardSummary {
  return {
    executingSessions: params.currentCount,
    recentActivities: params.recentCount,
    degradedServices: params.services.filter((item) => item.state !== "running").length,
  };
}
