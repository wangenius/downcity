/**
 * Console Dashboard service、plugin、chat、authorization 与 skill 写操作。
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
