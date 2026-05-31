/**
 * Console Dashboard agent、model、env 与命令写操作。
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

export async function switchModelMutation(params: {
  requestJson: RequestJson;
  primaryModelId: string;
  selectedAgentId: string;
  refreshModel: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const next = String(params.primaryModelId || "").trim();
  if (!next) return;
  if (!params.selectedAgentId) {
    params.showToast("当前无可用 agent", "error");
    return;
  }
  try {
    await params.requestJson(
      dashboardApiRoutes.uiModelSwitch(params.selectedAgentId),
      {
        method: "POST",
        body: JSON.stringify({ primaryModelId: next }),
      },
      params.selectedAgentId,
    );
    await params.refreshModel(params.selectedAgentId);
    params.showToast("agent model.primary 已更新（需重启 agent 完整生效）", "success");
  } catch (error) {
    params.showToast(`model.primary 更新失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function switchModelForAgentMutation(params: {
  requestJson: RequestJson;
  agentId: string;
  primaryModelId: string;
  selectedAgentId: string;
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const targetAgentId = String(params.agentId || "").trim();
  const next = String(params.primaryModelId || "").trim();
  if (!targetAgentId || !next) return;
  try {
    await params.requestJson(
      dashboardApiRoutes.uiModelSwitch(targetAgentId),
      {
        method: "POST",
        body: JSON.stringify({ primaryModelId: next }),
      },
      targetAgentId,
    );
    await params.refreshDashboard(params.selectedAgentId || targetAgentId);
    params.showToast(`已更新 ${targetAgentId} 的 model.primary（需重启 agent 生效）`, "success");
  } catch (error) {
    params.showToast(`agent model.primary 更新失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function updateAgentExecutionMutation(params: {
  requestJson: RequestJson;
  agentId: string;
  executionMode: "api" | "acp" | "local";
  modelId?: string;
  localModel?: string;
  agentType?: string;
  selectedAgentId: string;
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const targetAgentId = String(params.agentId || "").trim();
  if (!targetAgentId) return;
  try {
    await params.requestJson(
      dashboardApiRoutes.uiAgentExecution(),
      {
        method: "POST",
        body: JSON.stringify({
          projectRoot: targetAgentId,
          executionMode: params.executionMode,
          modelId: params.modelId,
          localModel: params.localModel,
          agentType: params.agentType,
        }),
      },
      targetAgentId,
    );
    await params.refreshDashboard(params.selectedAgentId || targetAgentId);
    params.showToast(`已更新 ${targetAgentId} 的 execution（需重启 agent 生效）`, "success");
  } catch (error) {
    params.showToast(`agent execution 更新失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function startAgentFromHistoryMutation(params: {
  requestJson: RequestJson;
  agentId: string;
  options?: {
    initializeIfNeeded?: boolean;
    initialization?: UiAgentInitializationInput;
  };
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const targetAgentId = String(params.agentId || "").trim();
  if (!targetAgentId) return;
  try {
    const data = await params.requestJson<{ started?: boolean; pid?: number }>(
      dashboardApiRoutes.uiAgentStart(),
      {
        method: "POST",
        body: JSON.stringify({
          agentId: targetAgentId,
          initializeIfNeeded: params.options?.initializeIfNeeded === true,
          initialization: params.options?.initialization
            ? {
                id: params.options.initialization.id,
                executionMode: params.options.initialization.executionMode,
                modelId: params.options.initialization.modelId,
                localModel: params.options.initialization.localModel,
                agentType: params.options.initialization.agentType,
              }
            : undefined,
        }),
      },
    );

    const readyState = await waitConsoleAgentReady({
      requestJson: params.requestJson,
      agentId: targetAgentId,
      maxRetry: 120,
      intervalMs: 500,
    });

    if (readyState.running && readyState.servicesReady) {
      await params.refreshDashboard(targetAgentId);
      if (data.started === true) {
        params.showToast(`agent 已启动（pid ${String(data.pid || "-")}）`, "success");
      } else {
        params.showToast("agent 已在运行", "info");
      }
      return;
    }

    params.showToast("agent 启动超时：服务未全部就绪", "error");
  } catch (error) {
    params.showToast(`启动 agent 失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function createAgentMutation(params: {
  requestJson: RequestJson;
  input: UiAgentCreatePayload;
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const projectRoot = String(params.input.projectRoot || "").trim();
  if (!projectRoot) return;
  try {
    const data = await params.requestJson<{
      started?: boolean;
      pid?: number;
      projectRoot?: string;
      id?: string;
    }>(dashboardApiRoutes.uiAgentCreate(), {
      method: "POST",
      body: JSON.stringify({
        projectRoot,
        id: params.input.id,
        executionMode: params.input.executionMode,
        modelId: params.input.modelId,
        localModel: params.input.localModel,
        agentType: params.input.agentType,
        autoStart: params.input.autoStart !== false,
      }),
    });

    if (params.input.autoStart === false || data.started !== true) {
      await params.refreshDashboard(projectRoot);
      params.showToast(`agent 已创建：${String(data.id || projectRoot)}`, "success");
      return;
    }

    const readyState = await waitConsoleAgentReady({
      requestJson: params.requestJson,
      agentId: projectRoot,
      maxRetry: 120,
      intervalMs: 500,
    });
    if (readyState.running && readyState.servicesReady) {
      await params.refreshDashboard(projectRoot);
      params.showToast(`agent 已创建并启动（pid ${String(data.pid || "-")}）`, "success");
      return;
    }

    params.showToast("agent 创建成功，但启动超时：服务未全部就绪", "error");
  } catch (error) {
    params.showToast(`创建 agent 失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function pickAgentDirectoryMutation(
  requestJson: RequestJson,
): Promise<string> {
  const data = await requestJson<{ directoryPath?: string }>(
    dashboardApiRoutes.uiPickDirectory(),
    { method: "POST" },
  );
  return String(data.directoryPath || "").trim();
}

export async function inspectAgentDirectoryMutation(
  requestJson: RequestJson,
  projectRoot: string,
): Promise<UiAgentDirectoryInspection | null> {
  const normalizedRoot = String(projectRoot || "").trim();
  if (!normalizedRoot) return null;
  const data = await requestJson<{
    inspection?: UiAgentDirectoryInspection;
  }>(
    dashboardApiRoutes.uiAgentInspect(),
    {
      method: "POST",
      body: JSON.stringify({ projectRoot: normalizedRoot }),
    },
  );
  return data.inspection || null;
}

export async function restartAgentFromHistoryMutation(params: {
  requestJson: RequestJson;
  agentId: string;
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const targetAgentId = String(params.agentId || "").trim();
  if (!targetAgentId) return;
  try {
    await params.requestJson(dashboardApiRoutes.uiAgentRestart(), {
      method: "POST",
      body: JSON.stringify({ agentId: targetAgentId }),
    });

    const readyState = await waitConsoleAgentReady({
      requestJson: params.requestJson,
      agentId: targetAgentId,
      maxRetry: 120,
      intervalMs: 500,
    });

    if (readyState.running && readyState.servicesReady) {
      await params.refreshDashboard(targetAgentId);
      params.showToast("agent 已重启", "success");
      return;
    }

    params.showToast("agent 重启超时：服务未全部就绪", "error");
  } catch (error) {
    const message = getErrorMessage(error);
    if (/not found/i.test(message)) {
      params.showToast("当前 Console 控制面版本过旧，请先执行 `bay console restart` 后再重启 agent", "error");
      return;
    }
    params.showToast(`重启 agent 失败: ${message}`, "error");
  }
}

export async function stopAgentFromHistoryMutation(params: {
  requestJson: RequestJson;
  agentId: string;
  selectedAgentId: string;
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const targetAgentId = String(params.agentId || "").trim();
  if (!targetAgentId) return;
  try {
    await params.requestJson(dashboardApiRoutes.uiAgentStop(), {
      method: "POST",
      body: JSON.stringify({ agentId: targetAgentId }),
    });

    const maxRetry = 20;
    const intervalMs = 400;
    let stopped = false;
    for (let index = 0; index < maxRetry; index += 1) {
      const agentsSnapshot = await params.requestJson<UiAgentsResponse>(
        dashboardApiRoutes.uiAgents(targetAgentId),
      );
      const list = Array.isArray(agentsSnapshot.agents) ? agentsSnapshot.agents : [];
      const target = list.find((item) => String(item.id || "") === targetAgentId);
      if (!target || target.running !== true) {
        stopped = true;
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
    }

    await params.refreshDashboard(params.selectedAgentId || targetAgentId);
    if (stopped) {
      params.showToast("agent 已停止", "success");
      return;
    }
    params.showToast("agent 停止中，请稍后刷新", "info");
  } catch (error) {
    const message = getErrorMessage(error);
    if (/not found/i.test(message)) {
      params.showToast("当前 Console 控制面版本过旧，请先执行 `bay console restart` 后再停止 agent", "error");
      return;
    }
    params.showToast(`停止 agent 失败: ${message}`, "error");
  }
}

export async function simplePostRefreshMutation(params: {
  requestJson: RequestJson;
  path: string;
  body: unknown;
  successMessage: string;
  errorMessage: string;
  after?: () => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  try {
    await params.requestJson(params.path, {
      method: "POST",
      body: JSON.stringify(params.body),
    });
    if (params.after) await params.after();
    params.showToast(params.successMessage, "success");
  } catch (error) {
    params.showToast(`${params.errorMessage}: ${getErrorMessage(error)}`, "error");
  }
}

export async function probeChannelAccountMutation(params: {
  requestJson: RequestJson;
  input: {
    channel: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
  };
  showToast: ShowToast;
}): Promise<UiChannelAccountProbeResult | null> {
  try {
    const data = await params.requestJson<{
      channel?: string;
      accountId?: string;
      name?: string;
      identity?: string;
      owner?: string;
      creator?: string;
      botUserId?: string;
      message?: string;
    }>(dashboardApiRoutes.uiChannelAccountProbe(), {
      method: "POST",
      body: JSON.stringify(params.input),
    });
    const payload: UiChannelAccountProbeResult = {
      channel: String(data.channel || params.input.channel || "").trim(),
      accountId: String(data.accountId || "").trim(),
      name: String(data.name || "").trim(),
      identity: String(data.identity || "").trim() || undefined,
      owner: String(data.owner || "").trim() || undefined,
      creator: String(data.creator || "").trim() || undefined,
      botUserId: String(data.botUserId || "").trim() || undefined,
      message: String(data.message || "").trim() || undefined,
    };
    if (!payload.accountId || !payload.name) {
      params.showToast("bot 信息探测成功，但返回数据不完整", "error");
      return null;
    }
    params.showToast(payload.message || "bot 信息探测成功", "success");
    return payload;
  } catch (error) {
    params.showToast(`bot 信息探测失败: ${getErrorMessage(error)}`, "error");
    return null;
  }
}

export async function discoverModelProviderMutation(params: {
  requestJson: RequestJson;
  input: {
    providerId: string;
    autoAdd?: boolean;
    prefix?: string;
  };
  selectedAgentId: string;
  refreshModelPool: () => Promise<void>;
  refreshModel: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<UiModelProviderDiscoverResult | null> {
  try {
    const data = await params.requestJson<UiModelProviderDiscoverResult & { success?: boolean }>(
      dashboardApiRoutes.uiModelProviderDiscover(),
      {
        method: "POST",
        body: JSON.stringify(params.input),
      },
    );
    const payload: UiModelProviderDiscoverResult = {
      providerId: String(data.providerId || params.input.providerId || "").trim(),
      discoveredModels: Array.isArray(data.discoveredModels) ? data.discoveredModels : [],
      modelCount: Number(data.modelCount || 0),
      autoAdded: Array.isArray(data.autoAdded) ? data.autoAdded : [],
    };
    if (params.input.autoAdd === true) {
      await Promise.all([
        params.refreshModelPool(),
        params.refreshModel(params.selectedAgentId),
      ]);
      params.showToast(
        `discover 完成：${payload.modelCount} 个，自动添加 ${payload.autoAdded.length} 个`,
        "success",
      );
    } else {
      params.showToast(`discover 完成：发现 ${payload.modelCount} 个模型，请选择后添加`, "success");
    }
    return payload;
  } catch (error) {
    params.showToast(`discover 失败: ${getErrorMessage(error)}`, "error");
    return null;
  }
}

export async function importEnvMutation(params: {
  requestJson: RequestJson;
  scope: "global" | "agent";
  agentId?: string;
  raw: string;
  refresh: () => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  try {
    const response = (await params.requestJson(dashboardApiRoutes.uiEnvImport(), {
      method: "POST",
      body: JSON.stringify({
        scope: params.scope,
        ...(params.agentId ? { agentId: params.agentId } : {}),
        raw: String(params.raw || ""),
      }),
    })) as {
      count?: number;
      keys?: string[];
    };
    await params.refresh();
    const count = Number(response.count || 0);
    const keys = Array.isArray(response.keys)
      ? response.keys.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    params.showToast(
      count > 0
        ? `已批量导入 ${count} 个${params.scope === "global" ? "全局" : "agent"} env${keys.length ? `：${keys.slice(0, 3).join("、")}${keys.length > 3 ? "…" : ""}` : ""}`
        : `已导入 ${params.scope === "global" ? "全局" : "agent"} env`,
      "success",
    );
  } catch (error) {
    params.showToast(`批量导入 env 失败: ${getErrorMessage(error)}`, "error");
    throw error;
  }
}

export async function executeAgentCommandMutation(params: {
  requestJson: RequestJson;
  input: {
    command: string;
    timeoutMs?: number;
    agentId?: string;
  };
  selectedAgentId: string;
}): Promise<UiCommandExecuteResult> {
  const command = String(params.input.command || "").trim();
  const targetAgentId = String(params.input.agentId || params.selectedAgentId || "").trim();
  if (!command) throw new Error("command 不能为空");
  if (!targetAgentId) throw new Error("当前无可用 agent");
  const response = await params.requestJson<UiCommandExecuteResponse>(
    dashboardApiRoutes.uiCommandExecute(),
    {
      method: "POST",
      body: JSON.stringify({
        agentId: targetAgentId,
        command,
        timeoutMs: params.input.timeoutMs,
      }),
    },
    targetAgentId,
  );
  if (!response.result) {
    throw new Error("command 执行失败：缺少结果");
  }
  return response.result;
}
