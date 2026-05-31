/**
 * Console Dashboard task 与 task run 写操作。
 *
 * 关键点（中文）
 * - 从 dashboard-mutations.ts 拆出，降低单文件复杂度。
 * - 继续保持原有函数签名，由聚合入口统一 re-export。
 */

/**
 * Console Dashboard 写操作共享依赖。
 *
 * 关键点（中文）
 * - 该文件由拆分后的 mutation 模块复用同一批 API route、toast 与响应类型。
 * - mutation 层不依赖 React，只通过 requestJson 与刷新回调和 hook 交互。
 */

import { dashboardApiRoutes, readConsoleAuthState, withConsoleAgent } from "../dashboard-api";
import { getErrorMessage } from "../../hooks/dashboard/shared";
import type {
  UiAgentCreatePayload,
  UiAgentDirectoryInspection,
  UiAgentInitializationInput,
  UiAgentsResponse,
  UiChannelAccountProbeResult,
  UiChatActionResult,
  UiChatAuthorizationResponse,
  UiChatChannelStatus,
  UiCommandExecuteResponse,
  UiCommandExecuteResult,
  UiModelProviderDiscoverResult,
  UiSkillFindPayload,
  UiSkillFindResult,
  UiSkillInstallPayload,
  UiSkillInstallResult,
  UiSkillLookupResult,
  UiPluginActionExecutionResult,
  UiPluginRuntimeItem,
  UiTaskMutationResponse,
  UiTaskRunDeleteResponse,
  UiTaskRunsClearResponse,
  UiTaskRunDetailResponse,
  UiTaskRunsResponse,
  UiTaskRunSummary,
  UiTaskStatusValue,
} from "../../types/Dashboard";
import { runSkillDashboardCommand, waitConsoleAgentReady } from "../dashboard-queries";

type RequestJson = <T>(path: string, options?: RequestInit, preferredAgentId?: string) => Promise<T>;
type ShowToast = (message: string, type?: "info" | "success" | "error") => void;

export async function runTaskMutation(params: {
  requestJson: RequestJson;
  title: string;
  selectedAgentId: string;
  refreshTasks: (agentId: string) => Promise<void>;
  refreshLogs: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  try {
    await params.requestJson(dashboardApiRoutes.taskRun(), {
      method: "POST",
      body: JSON.stringify({ title: params.title, reason: "dashboard_manual_trigger" }),
    });
    params.showToast(`task ${params.title} 已触发`, "success");
    await Promise.all([
      params.refreshTasks(params.selectedAgentId),
      params.refreshLogs(params.selectedAgentId),
    ]);
  } catch (error) {
    params.showToast(`task 执行失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function setTaskStatusMutation(params: {
  requestJson: RequestJson;
  title: string;
  status: UiTaskStatusValue;
  selectedAgentId: string;
  refreshTasks: (agentId: string) => Promise<void>;
  refreshOverview: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<boolean> {
  const normalizedTitle = String(params.title || "").trim();
  if (!normalizedTitle) {
    params.showToast("task title 不能为空", "error");
    return false;
  }
  try {
    const response = await params.requestJson<UiTaskMutationResponse>(
      dashboardApiRoutes.taskStatus(normalizedTitle),
      {
        method: "POST",
        body: JSON.stringify({ status: params.status }),
      },
      params.selectedAgentId,
    );
    const nextStatus = String(response?.status || params.status).trim() || params.status;
    params.showToast(`task ${normalizedTitle} 状态已更新为 ${nextStatus}`, "success");
    await Promise.all([
      params.refreshTasks(params.selectedAgentId),
      params.refreshOverview(params.selectedAgentId),
    ]);
    return true;
  } catch (error) {
    params.showToast(`task 状态更新失败: ${getErrorMessage(error)}`, "error");
    return false;
  }
}

export async function deleteTaskMutation(params: {
  requestJson: RequestJson;
  title: string;
  selectedAgentId: string;
  refreshTasks: (agentId: string) => Promise<void>;
  refreshOverview: (agentId: string) => Promise<void>;
  refreshLogs: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<boolean> {
  const normalizedTitle = String(params.title || "").trim();
  if (!normalizedTitle) {
    params.showToast("task title 不能为空", "error");
    return false;
  }
  try {
    await params.requestJson<UiTaskMutationResponse>(
      dashboardApiRoutes.taskDetail(normalizedTitle),
      { method: "DELETE" },
      params.selectedAgentId,
    );
    params.showToast(`task ${normalizedTitle} 已删除`, "success");
    await Promise.all([
      params.refreshTasks(params.selectedAgentId),
      params.refreshOverview(params.selectedAgentId),
      params.refreshLogs(params.selectedAgentId),
    ]);
    return true;
  } catch (error) {
    params.showToast(`task 删除失败: ${getErrorMessage(error)}`, "error");
    return false;
  }
}

export async function loadTaskRunsMutation(params: {
  requestJson: RequestJson;
  title: string;
  limit?: number;
  selectedAgentId: string;
  showToast: ShowToast;
}): Promise<UiTaskRunSummary[]> {
  const name = String(params.title || "").trim();
  if (!name) return [];
  try {
    const data = await params.requestJson<UiTaskRunsResponse>(
      dashboardApiRoutes.taskRuns(name, params.limit || 50),
      {},
      params.selectedAgentId,
    );
    return Array.isArray(data.runs) ? data.runs : [];
  } catch (error) {
    params.showToast(`加载 task runs 失败: ${getErrorMessage(error)}`, "error");
    return [];
  }
}

export async function deleteTaskRunMutation(params: {
  requestJson: RequestJson;
  title: string;
  timestamp: string;
  selectedAgentId: string;
  refreshLogs: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<boolean> {
  const normalizedTitle = String(params.title || "").trim();
  const normalizedTimestamp = String(params.timestamp || "").trim();
  if (!normalizedTitle || !normalizedTimestamp) {
    params.showToast("task title 或 run timestamp 不能为空", "error");
    return false;
  }
  try {
    await params.requestJson<UiTaskRunDeleteResponse>(
      dashboardApiRoutes.taskRunDetail(normalizedTitle, normalizedTimestamp),
      { method: "DELETE" },
      params.selectedAgentId,
    );
    params.showToast(`run ${normalizedTimestamp} 已删除`, "success");
    await params.refreshLogs(params.selectedAgentId);
    return true;
  } catch (error) {
    params.showToast(`删除 run 记录失败: ${getErrorMessage(error)}`, "error");
    return false;
  }
}

export async function clearTaskRunsMutation(params: {
  requestJson: RequestJson;
  title: string;
  selectedAgentId: string;
  refreshLogs: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<boolean> {
  const normalizedTitle = String(params.title || "").trim();
  if (!normalizedTitle) {
    params.showToast("task title 不能为空", "error");
    return false;
  }
  try {
    const data = await params.requestJson<UiTaskRunsClearResponse>(
      dashboardApiRoutes.taskRuns(normalizedTitle),
      { method: "DELETE" },
      params.selectedAgentId,
    );
    const deletedCount =
      typeof data.deletedCount === "number" && Number.isFinite(data.deletedCount)
        ? data.deletedCount
        : 0;
    const skippedCount =
      typeof data.skippedRunningCount === "number" && Number.isFinite(data.skippedRunningCount)
        ? data.skippedRunningCount
        : 0;
    if (skippedCount > 0) {
      params.showToast(
        `已清理 ${deletedCount} 条 run，跳过 ${skippedCount} 条运行中记录`,
        "success",
      );
    } else {
      params.showToast(`已清理 ${deletedCount} 条 run 记录`, "success");
    }
    await params.refreshLogs(params.selectedAgentId);
    return true;
  } catch (error) {
    params.showToast(`清理 run 记录失败: ${getErrorMessage(error)}`, "error");
    return false;
  }
}

export async function loadTaskRunDetailMutation(params: {
  requestJson: RequestJson;
  title: string;
  timestamp: string;
  selectedAgentId: string;
  showToast: ShowToast;
}): Promise<UiTaskRunDetailResponse | null> {
  const name = String(params.title || "").trim();
  const ts = String(params.timestamp || "").trim();
  if (!name || !ts) return null;
  try {
    return await params.requestJson<UiTaskRunDetailResponse>(
      dashboardApiRoutes.taskRunDetail(name, ts),
      {},
      params.selectedAgentId,
    );
  } catch (error) {
    params.showToast(`加载 run 详情失败: ${getErrorMessage(error)}`, "error");
    return null;
  }
}
