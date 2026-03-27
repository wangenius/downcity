/**
 * Console Dashboard 查询层。
 *
 * 关键点（中文）
 * - 统一封装 dashboard 读接口，不在 hook 内直接拼业务查询逻辑。
 * - 所有函数保持无 React 依赖，便于后续拆成更细的 hooks。
 */

import { dashboardApiRoutes } from "./dashboard-api";
import {
  CONSOLEUI_SESSION_ID,
  getErrorMessage,
  isAgentUnavailableError,
  isChatServiceNotReadyError,
  isNoRunningAgentError,
  isNotFoundError,
  isServiceNotRunningError,
  normalizePluginRuntimeItems,
  toHistoryEventsFromTimeline,
  wait,
} from "../hooks/dashboard/shared";
import type {
  UiAgentOption,
  UiAgentRuntimeStatusResponse,
  UiAgentsResponse,
  UiChannelAccountsResponse,
  UiChatAuthorizationResponse,
  UiChatChannelStatus,
  UiChatHistoryEvent,
  UiChatStatusResponse,
  UiConfigStatusResponse,
  UiEnvListResponse,
  UiLocalMessagesResponse,
  UiLogsResponse,
  UiModelPoolResponse,
  UiModelResponse,
  UiOverviewResponse,
  UiPluginRuntimeItem,
  UiPluginsResponse,
  UiPromptResponse,
  UiServiceItem,
  UiServicesResponse,
  UiSkillCommandResponse,
  UiSkillListResponse,
  UiSkillSummaryItem,
  UiTaskItem,
  UiTasksResponse,
  UiLogItem,
  UiModelPoolItem,
  UiModelProviderItem,
  UiModelSummary,
  UiChannelAccountItem,
  UiEnvItem,
  UiLocalMessage,
  UiSessionArchiveDetailResponse,
  UiSessionArchivesResponse,
  UiSessionArchiveSummary,
  UiSessionMessagesResponse,
  UiSessionSummary,
  UiSessionsResponse,
  UiSessionTimelineMessage,
} from "../types/Dashboard";

type RequestJson = <T>(
  path: string,
  options?: RequestInit,
  preferredAgentId?: string,
) => Promise<T>;

export async function queryAgents(params: {
  requestJson: RequestJson;
  preferredAgentId?: string;
  selectedAgentId: string;
}): Promise<{
  nextAgentId: string;
  list: UiAgentOption[];
  cityVersion: string;
}> {
  const preferred = String(params.preferredAgentId || params.selectedAgentId || "").trim();
  const endpoint = dashboardApiRoutes.uiAgents(preferred || undefined);
  let data: UiAgentsResponse;
  try {
    data = await params.requestJson<UiAgentsResponse>(endpoint);
  } catch (error) {
    const message = getErrorMessage(error);
    if (isNoRunningAgentError(message)) {
      return { nextAgentId: "", list: [], cityVersion: "" };
    }
    throw error;
  }

  const list = Array.isArray(data.agents) ? data.agents : [];
  const cityVersion = String(data.cityVersion || "").trim();
  const preferredMatched = preferred
    ? list.find((item) => item.id === preferred)?.id || ""
    : "";
  const backendSelected = String(data.selectedAgentId || "").trim();
  const backendMatched = backendSelected
    ? list.find((item) => item.id === backendSelected)?.id || ""
    : "";
  const runningFallback = list.find((item) => item.running === true)?.id || "";
  const firstFallback = list[0]?.id || "";
  return {
    nextAgentId: preferredMatched || backendMatched || runningFallback || firstFallback,
    list,
    cityVersion,
  };
}

export async function queryOverview(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiOverviewResponse | null> {
  if (!agentId) return null;
  return requestJson<UiOverviewResponse>(dashboardApiRoutes.overview(40), {}, agentId);
}

export async function queryServices(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiServiceItem[]> {
  if (!agentId) return [];
  const data = await requestJson<UiServicesResponse>(dashboardApiRoutes.services(), {}, agentId);
  return Array.isArray(data.services) ? data.services : [];
}

export async function querySkills(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiSkillSummaryItem[]> {
  if (!agentId) return [];
  try {
    const data = await requestJson<UiSkillListResponse>(
      dashboardApiRoutes.servicesCommand(),
      {
        method: "POST",
        body: JSON.stringify({
          serviceName: "skill",
          command: "list",
          payload: {},
        }),
      },
      agentId,
    );
    return Array.isArray(data?.data?.skills) ? data.data.skills : [];
  } catch (error) {
    const message = getErrorMessage(error);
    if (
      /404|not found|unknown action|unknown service/i.test(message) ||
      isAgentUnavailableError(message) ||
      isServiceNotRunningError(message, "skill")
    ) {
      return [];
    }
    throw error;
  }
}

export async function runSkillDashboardCommand<TData>(params: {
  requestJson: RequestJson;
  agentId: string;
  command: string;
  payload?: unknown;
}): Promise<UiSkillCommandResponse<TData>> {
  const targetAgentId = String(params.agentId || "").trim();
  if (!targetAgentId) throw new Error("当前无可用 agent");
  const command = String(params.command || "").trim();
  if (!command) throw new Error("skill command 不能为空");
  const payload = params.payload ?? {};

  const execute = async () =>
    params.requestJson<UiSkillCommandResponse<TData>>(
      dashboardApiRoutes.servicesCommand(),
      {
        method: "POST",
        body: JSON.stringify({
          serviceName: "skill",
          command,
          payload,
        }),
      },
      targetAgentId,
    );

  try {
    return await execute();
  } catch (error) {
    const message = getErrorMessage(error);
    if (!isServiceNotRunningError(message, "skill")) {
      throw error;
    }
    await params.requestJson(
      dashboardApiRoutes.servicesControl(),
      {
        method: "POST",
        body: JSON.stringify({
          serviceName: "skill",
          action: "start",
        }),
      },
      targetAgentId,
    );
    return execute();
  }
}

export async function waitConsoleAgentReady(params: {
  requestJson: RequestJson;
  agentId: string;
  maxRetry?: number;
  intervalMs?: number;
}): Promise<{ running: boolean; servicesReady: boolean }> {
  const targetAgentId = String(params.agentId || "").trim();
  if (!targetAgentId) return { running: false, servicesReady: false };
  const maxRetry = Number.isFinite(params.maxRetry as number) ? Number(params.maxRetry) : 36;
  const intervalMs = Number.isFinite(params.intervalMs as number) ? Number(params.intervalMs) : 500;
  let running = false;

  for (let index = 0; index < maxRetry; index += 1) {
    try {
      const agentsSnapshot = await params.requestJson<UiAgentsResponse>(
        dashboardApiRoutes.uiAgents(targetAgentId),
      );
      const list = Array.isArray(agentsSnapshot.agents) ? agentsSnapshot.agents : [];
      const target = list.find((item) => String(item.id || "") === targetAgentId);
      running = target?.running === true;
    } catch {
      running = false;
    }

    if (!running) {
      await wait(intervalMs);
      continue;
    }

    try {
      const runtimeStatus = await params.requestJson<UiAgentRuntimeStatusResponse>(
        dashboardApiRoutes.uiAgentRuntimeStatus(targetAgentId),
      );
      if (runtimeStatus.running !== true) {
        await wait(intervalMs);
        continue;
      }
      if (runtimeStatus.serverReady !== true) {
        await wait(intervalMs);
        continue;
      }
      if (runtimeStatus.servicesReady === true) {
        return { running: true, servicesReady: true };
      }
      await wait(intervalMs);
      continue;
    } catch (error) {
      const message = getErrorMessage(error);
      if (!isAgentUnavailableError(message)) {
        // ignore
      }
    }

    await wait(intervalMs);
  }

  return { running, servicesReady: false };
}

export async function queryPlugins(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiPluginRuntimeItem[]> {
  if (!agentId) return [];
  const data = await requestJson<UiPluginsResponse>(dashboardApiRoutes.uiPlugins(agentId));
  const list = Array.isArray(data.plugins) ? data.plugins : [];
  return normalizePluginRuntimeItems(list);
}

export async function queryChatChannels(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiChatChannelStatus[]> {
  if (!agentId) return [];
  try {
    const data = await requestJson<UiChatStatusResponse>(
      dashboardApiRoutes.servicesCommand(),
      {
        method: "POST",
        body: JSON.stringify({
          serviceName: "chat",
          command: "status",
          payload: {},
        }),
      },
      agentId,
    );
    const channels = Array.isArray(data?.data?.channels) ? data.data.channels : [];
    return [
      ...channels,
      {
        channel: "consoleui",
        enabled: true,
        configured: true,
        running: true,
        linkState: "connected",
        statusText: "console-ui built-in channel",
        detail: {
          readonly: true,
          managedBy: "console-ui",
        },
      } as UiChatChannelStatus,
    ];
  } catch (error) {
    const message = getErrorMessage(error);
    if (isChatServiceNotReadyError(message) || isAgentUnavailableError(message)) {
      return [
        {
          channel: "consoleui",
          enabled: true,
          configured: true,
          running: true,
          linkState: "connected",
          statusText: "console-ui built-in channel",
          detail: {
            readonly: true,
            managedBy: "console-ui",
          },
        },
      ];
    }
    throw error;
  }
}

export async function querySessions(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiSessionSummary[]> {
  if (!agentId) return [];
  const data = await requestJson<UiSessionsResponse>(dashboardApiRoutes.sessions(120), {}, agentId);
  const list = Array.isArray(data.sessions) ? data.sessions : [];
  const hasConsoleUiSession = list.some(
    (item) => String(item.sessionId || "").trim() === CONSOLEUI_SESSION_ID,
  );
  return hasConsoleUiSession
    ? list
    : [
        {
          sessionId: CONSOLEUI_SESSION_ID,
          channel: "consoleui",
          messageCount: 0,
          updatedAt: Date.now(),
          lastRole: "system",
          lastText: "consoleui channel",
        },
        ...list,
      ];
}

export async function queryChannelHistory(
  requestJson: RequestJson,
  agentId: string,
  sessionId: string,
): Promise<UiChatHistoryEvent[]> {
  if (!agentId || !sessionId) return [];
  try {
    const data = await requestJson<UiChatStatusResponse>(
      dashboardApiRoutes.servicesCommand(),
      {
        method: "POST",
        body: JSON.stringify({
          serviceName: "chat",
          command: "history",
          payload: {
            sessionId,
            limit: 80,
          },
        }),
      },
      agentId,
    );
    const events = Array.isArray(data?.data?.events) ? data.data.events : [];
    if (events.length > 0 || !String(sessionId || "").startsWith("consoleui-")) {
      return events;
    }
  } catch (error) {
    const isConsoleUi =
      String(sessionId || "").trim().toLowerCase().startsWith("consoleui-") ||
      String(sessionId || "").trim().toLowerCase() === "local_ui";
    if (!isConsoleUi) throw error;
  }

  const fallbackData = await requestJson<UiSessionMessagesResponse>(
    dashboardApiRoutes.sessionMessages(sessionId, 100),
    {},
    agentId,
  );
  const timeline = Array.isArray(fallbackData.messages) ? fallbackData.messages : [];
  return toHistoryEventsFromTimeline(sessionId, timeline);
}

export async function querySessionMessages(
  requestJson: RequestJson,
  agentId: string,
  sessionId: string,
): Promise<UiSessionTimelineMessage[]> {
  if (!agentId || !sessionId) return [];
  const data = await requestJson<UiSessionMessagesResponse>(
    dashboardApiRoutes.sessionMessages(sessionId, 100),
    {},
    agentId,
  );
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function querySessionArchiveDetail(
  requestJson: RequestJson,
  agentId: string,
  sessionId: string,
  archiveId: string,
): Promise<UiSessionArchiveDetailResponse> {
  return requestJson<UiSessionArchiveDetailResponse>(
    dashboardApiRoutes.sessionArchiveDetail(sessionId, archiveId),
    {},
    agentId,
  );
}

export async function querySessionArchives(
  requestJson: RequestJson,
  agentId: string,
  sessionId: string,
): Promise<UiSessionArchiveSummary[]> {
  if (!agentId || !sessionId) return [];
  try {
    const data = await requestJson<UiSessionArchivesResponse>(
      dashboardApiRoutes.sessionArchives(sessionId, 80),
      {},
      agentId,
    );
    return Array.isArray(data.archives) ? data.archives : [];
  } catch (error) {
    if (isNotFoundError(getErrorMessage(error))) return [];
    throw error;
  }
}


export async function queryTasks(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiTaskItem[]> {
  if (!agentId) return [];
  const data = await requestJson<UiTasksResponse>(dashboardApiRoutes.tasks(), {}, agentId);
  return Array.isArray(data.tasks) ? data.tasks : [];
}

export async function queryLogs(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiLogItem[]> {
  if (!agentId) return [];
  const data = await requestJson<UiLogsResponse>(dashboardApiRoutes.logs(260), {}, agentId);
  return Array.isArray(data.logs) ? data.logs : [];
}

export async function queryModel(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiModelSummary | null> {
  try {
    const endpoint = dashboardApiRoutes.uiModel(agentId || undefined);
    const data = await requestJson<UiModelResponse>(endpoint, {}, agentId);
    return data.model || null;
  } catch (error) {
    if (/404|not found/i.test(getErrorMessage(error))) return null;
    throw error;
  }
}

export async function queryConfigStatus(
  requestJson: RequestJson,
  agentId: string,
): Promise<NonNullable<UiConfigStatusResponse["items"]>> {
  const endpoint = dashboardApiRoutes.uiConfigStatus(agentId || undefined);
  const data = await requestJson<UiConfigStatusResponse>(endpoint, {}, agentId);
  return Array.isArray(data.items) ? data.items : [];
}

export async function queryModelPool(requestJson: RequestJson): Promise<{
  providers: UiModelProviderItem[];
  models: UiModelPoolItem[];
}> {
  const data = await requestJson<UiModelPoolResponse>(dashboardApiRoutes.uiModelPool());
  return {
    providers: Array.isArray(data.providers) ? data.providers : [],
    models: Array.isArray(data.models) ? data.models : [],
  };
}

export async function queryGlobalEnv(requestJson: RequestJson): Promise<UiEnvItem[]> {
  const data = await requestJson<UiEnvListResponse>(dashboardApiRoutes.uiEnv());
  return Array.isArray(data.items) ? data.items : [];
}

export async function queryAgentEnv(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiEnvItem[]> {
  if (!agentId) return [];
  const data = await requestJson<UiEnvListResponse>(dashboardApiRoutes.uiAgentEnv(agentId));
  return Array.isArray(data.items) ? data.items : [];
}

export async function queryChannelAccounts(
  requestJson: RequestJson,
): Promise<UiChannelAccountItem[]> {
  const data = await requestJson<UiChannelAccountsResponse>(dashboardApiRoutes.uiChannelAccounts());
  return Array.isArray(data.items) ? data.items : [];
}

export async function queryPrompt(
  requestJson: RequestJson,
  agentId: string,
  sessionId?: string,
): Promise<UiPromptResponse | null> {
  if (!agentId) return null;
  const resolvedSessionId =
    String(sessionId || CONSOLEUI_SESSION_ID).trim() || CONSOLEUI_SESSION_ID;
  try {
    return await requestJson<UiPromptResponse>(
      dashboardApiRoutes.systemPrompt(resolvedSessionId),
      {},
      agentId,
    );
  } catch (error) {
    if (/404|not found/i.test(getErrorMessage(error))) return null;
    throw error;
  }
}

export async function queryLocalMessages(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiLocalMessage[]> {
  if (!agentId) return [];
  const data = await requestJson<UiLocalMessagesResponse>(
    dashboardApiRoutes.localMessages(CONSOLEUI_SESSION_ID, 80),
    {},
    agentId,
  );
  return Array.isArray(data.messages) ? data.messages : [];
}

export async function queryAuthorization(
  requestJson: RequestJson,
  agentId: string,
): Promise<UiChatAuthorizationResponse | null> {
  if (!agentId) return null;
  return requestJson<UiChatAuthorizationResponse>(
    dashboardApiRoutes.authorization(),
    {},
    agentId,
  );
}
