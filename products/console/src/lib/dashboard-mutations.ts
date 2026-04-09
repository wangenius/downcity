/**
 * Console Dashboard 写操作层。
 *
 * 关键点（中文）
 * - 统一封装 dashboard 的 mutation / command 调用。
 * - 不依赖 React，仅通过回调与 hook 交互。
 */

import { dashboardApiRoutes, readConsoleAuthState, withConsoleAgent } from "./dashboard-api";
import { getErrorMessage } from "../hooks/dashboard/shared";
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
} from "../types/Dashboard";
import { runSkillDashboardCommand, waitConsoleAgentReady } from "./dashboard-queries";
type RequestJson = <T>(path: string, options?: RequestInit, preferredAgentId?: string) => Promise<T>;
type ShowToast = (message: string, type?: "info" | "success" | "error") => void;

export async function controlServiceMutation(params: {
  requestJson: RequestJson;
  serviceName: string;
  action: string;
  selectedAgentId: string;
  refreshServices: (agentId: string) => Promise<void>;
  refreshSkills: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  try {
    await params.requestJson(dashboardApiRoutes.servicesControl(), {
      method: "POST",
      body: JSON.stringify({ serviceName: params.serviceName, action: params.action }),
    });
    params.showToast(`service ${params.serviceName} ${params.action} 已执行`, "success");
    await Promise.all([
      params.refreshServices(params.selectedAgentId),
      params.refreshSkills(params.selectedAgentId),
    ]);
  } catch (error) {
    params.showToast(`service 操作失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function runPluginActionMutation(params: {
  requestJson: RequestJson;
  pluginName: string;
  actionName: string;
  payload?: Record<string, unknown>;
  selectedAgentId: string;
  refreshPlugins: (agentId: string) => Promise<UiPluginRuntimeItem[] | void>;
  refreshGlobalPlugins?: () => Promise<UiPluginRuntimeItem[] | void>;
  scope?: "agent" | "global";
  showToast: ShowToast;
}): Promise<UiPluginActionExecutionResult> {
  try {
    const authState = readConsoleAuthState();
    const scope = params.scope === "global" ? "global" : "agent";
    const path =
      scope === "global"
        ? dashboardApiRoutes.uiPluginsAction(params.selectedAgentId)
        : withConsoleAgent(
            dashboardApiRoutes.pluginsAction(),
            params.selectedAgentId,
          );
    const response = await fetch(
      path,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authState?.token ? { Authorization: `Bearer ${authState.token}` } : {}),
        },
        body: JSON.stringify({
          pluginName: params.pluginName,
          actionName: params.actionName,
          payload: params.payload,
        }),
      },
    );
    const raw = await response.text();
    const result = (raw ? JSON.parse(raw) : {}) as {
      success?: boolean;
      message?: string;
      error?: string;
      data?: unknown;
    };
    const message = String(
      result?.message || result?.error || `${params.pluginName} ${params.actionName}`,
    ).trim();
    const logs = extractPluginActionLogs(result?.data, message);
    const shouldRefreshPlugins =
      params.actionName === "on" ||
      params.actionName === "off" ||
      params.actionName === "install" ||
      params.actionName === "configure" ||
      params.actionName === "use";
    if (shouldRefreshPlugins && scope === "global" && params.refreshGlobalPlugins) {
      void params.refreshGlobalPlugins().catch(() => undefined);
    }
    if (shouldRefreshPlugins && scope === "agent" && params.selectedAgentId) {
      void params.refreshPlugins(params.selectedAgentId).catch(() => undefined);
    }
    params.showToast(
      `plugin ${params.pluginName} ${params.actionName}: ${message}`,
      response.ok && result?.success ? "success" : "error",
    );
    return {
      success: response.ok && result?.success === true,
      message,
      data: result?.data,
      logs,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    params.showToast(`plugin 操作失败: ${message}`, "error");
    return {
      success: false,
      message,
    };
  }
}

function extractPluginActionLogs(data: unknown, message: string): string[] {
  const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const rawLogs = Array.isArray(payload?.logs)
    ? payload.logs
    : payload?.details && typeof payload.details === "object" && Array.isArray((payload.details as Record<string, unknown>).logs)
      ? ((payload.details as Record<string, unknown>).logs as unknown[])
      : [];
  const logs = rawLogs
    .map((entry) => String(entry || "").trim())
    .filter(Boolean);
  if (logs.length > 0) return logs;
  return message ? [message] : [];
}

export async function runChatChannelActionMutation(params: {
  requestJson: RequestJson;
  action: "test" | "reconnect" | "open" | "close";
  channel: string;
  chatChannels: UiChatChannelStatus[];
  selectedAgentId: string;
  refreshChatChannels: (agentId: string) => Promise<UiChatChannelStatus[]>;
  refreshServices: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  try {
    const payload = params.channel ? { channel: params.channel } : {};
    const data = await params.requestJson<{
      data?: { results?: UiChatActionResult[] };
    } & Record<string, unknown>>(dashboardApiRoutes.servicesCommand(), {
      method: "POST",
      body: JSON.stringify({
        serviceName: "chat",
        command: params.action,
        payload,
      }),
    });

    if (params.action === "test") {
      const results = Array.isArray(data?.data?.results) ? data.data.results : [];
      const one: UiChatActionResult | undefined = params.channel
        ? results.find((item) => String(item.channel || "") === params.channel)
        : results[0];
      const message = String(one?.message || "test completed");
      params.showToast(
        `${params.channel || "chat"} test: ${message}`,
        one?.success ? "success" : "error",
      );

      const statusRow = params.chatChannels.find(
        (item) => String(item.channel || "").trim() === String(params.channel || "").trim(),
      );
      const linkState = String(statusRow?.linkState || "").trim().toLowerCase();
      const shouldAutoReconnect =
        Boolean(params.channel) &&
        Boolean(one?.success) &&
        linkState !== "connected";
      if (shouldAutoReconnect) {
        await params.requestJson(dashboardApiRoutes.servicesCommand(), {
          method: "POST",
          body: JSON.stringify({
            serviceName: "chat",
            command: "reconnect",
            payload: { channel: params.channel },
          }),
        });
        params.showToast(`${params.channel} test 通过，已自动 reconnect`, "success");
      }
    } else if (params.action === "open" || params.action === "close") {
      params.showToast(
        `${params.channel || "chat"} ${params.action} 已执行（已写入 downcity.json）`,
        "success",
      );
    } else {
      params.showToast(`${params.channel || "chat"} ${params.action} 已执行`, "success");
    }

    await Promise.all([
      params.refreshChatChannels(params.selectedAgentId),
      params.refreshServices(params.selectedAgentId),
    ]);
  } catch (error) {
    params.showToast(`chat ${params.action} 失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function configureChatChannelMutation(params: {
  requestJson: RequestJson;
  channel: string;
  config: Record<string, unknown>;
  selectedAgentId: string;
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<void> {
  const normalizedChannel = String(params.channel || "").trim();
  if (!normalizedChannel) return;
  try {
    await params.requestJson(dashboardApiRoutes.servicesCommand(), {
      method: "POST",
      body: JSON.stringify({
        serviceName: "chat",
        command: "configure",
        payload: {
          channel: normalizedChannel,
          config: params.config,
          restart: true,
        },
      }),
    });
    params.showToast(`${normalizedChannel} 配置已保存并重载`, "success");
    await params.refreshDashboard(params.selectedAgentId);
  } catch (error) {
    params.showToast(`配置 ${normalizedChannel} 失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function saveAuthorizationConfigMutation(params: {
  requestJson: RequestJson;
  config: NonNullable<UiChatAuthorizationResponse["config"]>;
  selectedAgentId: string;
  setAuthorization: (value: UiChatAuthorizationResponse | null) => void;
  showToast: ShowToast;
}): Promise<void> {
  if (!params.selectedAgentId) {
    params.showToast("当前无可用 agent", "error");
    return;
  }
  try {
    const data = await params.requestJson<UiChatAuthorizationResponse>(
      dashboardApiRoutes.authorizationConfig(),
      {
        method: "POST",
        body: JSON.stringify({ config: params.config }),
      },
      params.selectedAgentId,
    );
    params.setAuthorization(data);
    params.showToast("authorization 配置已保存", "success");
  } catch (error) {
    params.showToast(`保存 authorization 失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function runAuthorizationActionMutation(params: {
  requestJson: RequestJson;
  input: {
    action: "setUserRole";
    channel: string;
    userId?: string;
    roleId?: string;
  };
  selectedAgentId: string;
  setAuthorization: (value: UiChatAuthorizationResponse | null) => void;
  showToast: ShowToast;
}): Promise<void> {
  if (!params.selectedAgentId) {
    params.showToast("当前无可用 agent", "error");
    return;
  }
  try {
    const data = await params.requestJson<UiChatAuthorizationResponse>(
      dashboardApiRoutes.authorizationAction(),
      {
        method: "POST",
        body: JSON.stringify(params.input),
      },
      params.selectedAgentId,
    );
    params.setAuthorization(data);
    params.showToast(`authorization ${params.input.action} 已执行`, "success");
  } catch (error) {
    params.showToast(`authorization ${params.input.action} 失败: ${getErrorMessage(error)}`, "error");
  }
}

export async function runSkillFindMutation(params: {
  requestJson: RequestJson;
  query: string;
  selectedAgentId: string;
  refreshSkills: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<UiSkillFindResult | null> {
  const normalizedQuery = String(params.query || "").trim();
  if (!normalizedQuery) {
    params.showToast("请输入要查找的 skill 关键词", "error");
    return null;
  }
  if (!params.selectedAgentId) {
    params.showToast("当前无可用 agent", "error");
    return null;
  }
  const payload: UiSkillFindPayload = { query: normalizedQuery };
  try {
    const data = await runSkillDashboardCommand<UiSkillFindResult>({
      requestJson: params.requestJson,
      agentId: params.selectedAgentId,
      command: "find",
      payload,
    });
    const result = data?.data || null;
    params.showToast(result?.message || `已执行 skill find: ${normalizedQuery}`, "success");
    await params.refreshSkills(params.selectedAgentId);
    return result;
  } catch (error) {
    params.showToast(`skill find 失败: ${getErrorMessage(error)}`, "error");
    return null;
  }
}

export async function runSkillInstallMutation(params: {
  requestJson: RequestJson;
  input: UiSkillInstallPayload;
  selectedAgentId: string;
  refreshSkills: (agentId: string) => Promise<void>;
  showToast: ShowToast;
}): Promise<UiSkillInstallResult | null> {
  const spec = String(params.input.spec || "").trim();
  if (!spec) {
    params.showToast("请输入要安装的 skill spec", "error");
    return null;
  }
  if (!params.selectedAgentId) {
    params.showToast("当前无可用 agent", "error");
    return null;
  }
  const payload: UiSkillInstallPayload = {
    spec,
    global: params.input.global !== false,
    yes: params.input.yes !== false,
    agent: String(params.input.agent || "claude-code").trim() || "claude-code",
  };
  try {
    const data = await runSkillDashboardCommand<UiSkillInstallResult>({
      requestJson: params.requestJson,
      agentId: params.selectedAgentId,
      command: "install",
      payload,
    });
    const result = data?.data || null;
    params.showToast(result?.message || `skill 安装完成: ${spec}`, "success");
    await params.refreshSkills(params.selectedAgentId);
    return result;
  } catch (error) {
    params.showToast(`skill install 失败: ${getErrorMessage(error)}`, "error");
    return null;
  }
}

export async function runSkillLookupMutation(params: {
  requestJson: RequestJson;
  name: string;
  selectedAgentId: string;
  showToast: ShowToast;
}): Promise<UiSkillLookupResult | null> {
  const normalizedName = String(params.name || "").trim();
  if (!normalizedName) {
    params.showToast("请输入 skill 名称", "error");
    return null;
  }
  if (!params.selectedAgentId) {
    params.showToast("当前无可用 agent", "error");
    return null;
  }
  try {
    const data = await runSkillDashboardCommand<UiSkillLookupResult>({
      requestJson: params.requestJson,
      agentId: params.selectedAgentId,
      command: "lookup",
      payload: { name: normalizedName },
    });
    const result = data?.data || null;
    const targetName = String(result?.skill?.name || normalizedName).trim() || normalizedName;
    params.showToast(result?.message || `skill lookup 已执行: ${targetName}`, "success");
    return result;
  } catch (error) {
    params.showToast(`skill lookup 失败: ${getErrorMessage(error)}`, "error");
    return null;
  }
}

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
                agentName: params.options.initialization.agentName,
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
      agentName?: string;
    }>(dashboardApiRoutes.uiAgentCreate(), {
      method: "POST",
      body: JSON.stringify({
        projectRoot,
        agentName: params.input.agentName,
        executionMode: params.input.executionMode,
        modelId: params.input.modelId,
        localModel: params.input.localModel,
        agentType: params.input.agentType,
        autoStart: params.input.autoStart !== false,
      }),
    });

    if (params.input.autoStart === false || data.started !== true) {
      await params.refreshDashboard(projectRoot);
      params.showToast(`agent 已创建：${String(data.agentName || projectRoot)}`, "success");
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
      params.showToast("当前 Console UI 进程版本过旧，请先重启 `city console ui` 后再重启 agent", "error");
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
      params.showToast("当前 Console UI 进程版本过旧，请先重启 `city console ui` 后再停止 agent", "error");
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
