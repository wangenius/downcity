/**
 * Console Dashboard 刷新编排 Hook。
 *
 * 关键点（中文）
 * - 集中管理整页刷新与 session 切换后的联动刷新。
 * - 保持 `useConsoleDashboard` 主文件只负责状态装配，避免刷新流程继续膨胀。
 */

import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { dashboardApiRoutes } from "../../lib/dashboard-api";
import { CONSOLEUI_CONTEXT_ID, getErrorMessage, isAgentUnavailableError } from "./shared";
import type {
  UiAgentOption,
  UiAgentsResponse,
  UiChatHistoryEvent,
  UiChatChannelStatus,
  UiEnvItem,
  UiPluginRuntimeItem,
  UiPromptResponse,
  UiSessionArchiveSummary,
  UiSessionSummary,
  UiSessionTimelineMessage,
} from "../../types/Dashboard";
import type { DashboardToastType } from "../../types/DashboardHook";

function clearSessionView(params: {
  setChannelHistory: (value: UiChatHistoryEvent[]) => void;
  setSessionMessages: (value: UiSessionTimelineMessage[]) => void;
  setSessionArchives: (value: UiSessionArchiveSummary[]) => void;
  setSelectedArchiveId: (value: string) => void;
  setSessionArchiveMessages: (value: UiSessionTimelineMessage[]) => void;
  setPrompt: (value: UiPromptResponse | null) => void;
}): void {
  params.setChannelHistory([]);
  params.setSessionMessages([]);
  params.setSessionArchives([]);
  params.setSelectedArchiveId("");
  params.setSessionArchiveMessages([]);
  params.setPrompt(null);
}

function resolveNextSessionId(params: {
  sessions: UiSessionSummary[];
  currentSessionId: string;
}): string {
  const byCurrent =
    params.sessions.find((item) => item.contextId === params.currentSessionId)?.contextId || "";
  const consoleUi =
    params.sessions.find((item) => item.contextId === CONSOLEUI_CONTEXT_ID)?.contextId || "";
  const fallback = params.sessions[0]?.contextId || "";
  return byCurrent || consoleUi || fallback;
}

export function useDashboardRefresh(params: {
  requestJson: <T>(
    path: string,
    options?: RequestInit,
    preferredAgentId?: string,
  ) => Promise<T>;
  selectedAgentId: string;
  selectedSessionIdRef: MutableRefObject<string>;
  setSelectedAgentId: (value: string) => void;
  setSelectedSessionId: (value: string) => void;
  setAgentEnvItems: (value: UiEnvItem[]) => void;
  setTopbarError: (value: boolean) => void;
  setTopbarStatus: (value: string) => void;
  setLoading: (value: boolean) => void;
  setChannelHistory: (value: UiChatHistoryEvent[]) => void;
  setSessionMessages: (value: UiSessionTimelineMessage[]) => void;
  setSessionArchives: (value: UiSessionArchiveSummary[]) => void;
  setSelectedArchiveId: (value: string) => void;
  setSessionArchiveMessages: (value: UiSessionTimelineMessage[]) => void;
  setPrompt: (value: UiPromptResponse | null) => void;
  clearPanelDataForNoAgent: () => void;
  refreshAgents: (
    preferredAgentId?: string,
  ) => Promise<{ nextAgentId: string; list: UiAgentOption[] }>;
  refreshPlugins: (agentId: string) => Promise<UiPluginRuntimeItem[] | void>;
  refreshModel: (agentId: string) => Promise<void>;
  refreshModelPool: () => Promise<void>;
  refreshChannelAccounts: () => Promise<void>;
  refreshGlobalEnv: () => Promise<void>;
  refreshConfigStatus: (agentId: string) => Promise<void>;
  refreshAgentEnv: (agentId: string) => Promise<void>;
  refreshChatChannels: (agentId: string) => Promise<UiChatChannelStatus[]>;
  refreshSessions: (agentId: string) => Promise<UiSessionSummary[]>;
  refreshAuthorization: (agentId: string) => Promise<void>;
  refreshOverview: (agentId: string) => Promise<void>;
  refreshServices: (agentId: string) => Promise<void>;
  refreshSkills: (agentId: string) => Promise<void>;
  refreshTasks: (agentId: string) => Promise<void>;
  refreshLogs: (agentId: string) => Promise<void>;
  refreshLocalChat: (agentId: string) => Promise<void>;
  refreshChannelHistory: (agentId: string, contextId: string) => Promise<void>;
  refreshSessionMessages: (agentId: string, contextId: string) => Promise<void>;
  refreshSessionArchives: (agentId: string, contextId: string) => Promise<UiSessionArchiveSummary[]>;
  refreshPrompt: (agentId: string, contextId?: string) => Promise<void>;
  showToast: (message: string, type?: DashboardToastType) => void;
}): {
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  handleSessionChange: (contextId: string) => Promise<void>;
} {
  const refreshDashboard = useCallback(
    async (preferredAgentId?: string) => {
      params.setLoading(true);
      try {
        const { nextAgentId, list } = await params.refreshAgents(preferredAgentId);
        if (!nextAgentId) {
          params.setSelectedAgentId("");
          params.clearPanelDataForNoAgent();
          await Promise.allSettled([
            params.refreshPlugins(""),
            params.refreshModel(""),
            params.refreshModelPool(),
            params.refreshChannelAccounts(),
            params.refreshGlobalEnv(),
            params.refreshConfigStatus(""),
          ]);
          params.setAgentEnvItems([]);
          params.setTopbarError(false);
          params.setTopbarStatus("Console 在线");
          return;
        }

        const selected = list.find((item) => item.id === nextAgentId) || null;
        if (selected && selected.running !== true) {
          // 关键点（中文）：未运行 agent 仅展示静态配置与全局数据，不再打 runtime 接口。
          params.clearPanelDataForNoAgent();
          await Promise.allSettled([
            params.refreshPlugins(""),
            params.refreshModel(nextAgentId),
            params.refreshModelPool(),
            params.refreshChannelAccounts(),
            params.refreshGlobalEnv(),
            params.refreshAgentEnv(nextAgentId),
            params.refreshConfigStatus(nextAgentId),
          ]);
          params.setTopbarError(false);
          params.setTopbarStatus("Console 在线");
          return;
        }

        const [, sessionList] = await Promise.all([
          params.refreshChatChannels(nextAgentId),
          params.refreshSessions(nextAgentId),
        ]);

        await Promise.all([
          params.refreshAuthorization(nextAgentId),
          params.refreshPlugins(nextAgentId),
          params.refreshOverview(nextAgentId),
          params.refreshServices(nextAgentId),
          params.refreshSkills(nextAgentId),
          params.refreshTasks(nextAgentId),
          params.refreshLogs(nextAgentId),
          params.refreshModel(nextAgentId),
          params.refreshModelPool(),
          params.refreshChannelAccounts(),
          params.refreshGlobalEnv(),
          params.refreshAgentEnv(nextAgentId),
          params.refreshConfigStatus(nextAgentId),
          params.refreshLocalChat(nextAgentId),
        ]);

        const nextContextId = resolveNextSessionId({
          sessions: sessionList,
          currentSessionId: String(params.selectedSessionIdRef.current || "").trim(),
        });
        params.setSelectedSessionId(nextContextId);

        if (nextContextId) {
          await Promise.all([
            params.refreshChannelHistory(nextAgentId, nextContextId),
            params.refreshSessionMessages(nextAgentId, nextContextId),
            params.refreshSessionArchives(nextAgentId, nextContextId),
            params.refreshPrompt(nextAgentId, nextContextId),
          ]);
        } else {
          clearSessionView({
            setChannelHistory: params.setChannelHistory,
            setSessionMessages: params.setSessionMessages,
            setSessionArchives: params.setSessionArchives,
            setSelectedArchiveId: params.setSelectedArchiveId,
            setSessionArchiveMessages: params.setSessionArchiveMessages,
            setPrompt: params.setPrompt,
          });
        }

        params.setTopbarError(false);
        params.setTopbarStatus("Console 在线");
      } catch (error) {
        const message = getErrorMessage(error);
        if (isAgentUnavailableError(message)) {
          const targetHint = String(preferredAgentId || params.selectedAgentId || "").trim();
          if (targetHint) {
            try {
              const agentsSnapshot = await params.requestJson<UiAgentsResponse>(
                dashboardApiRoutes.uiAgents(targetHint),
              );
              const list = Array.isArray(agentsSnapshot.agents) ? agentsSnapshot.agents : [];
              const target = list.find((item) => String(item.id || "") === targetHint);
              if (target?.running === true) {
                params.setSelectedAgentId(targetHint);
                params.setTopbarError(false);
                return;
              }
            } catch {
              // ignore
            }
          }

          params.clearPanelDataForNoAgent();
          params.setSelectedAgentId("");
          await Promise.allSettled([
            params.refreshPlugins(""),
            params.refreshModel(""),
            params.refreshModelPool(),
            params.refreshChannelAccounts(),
            params.refreshGlobalEnv(),
            params.refreshConfigStatus(""),
          ]);
          params.setAgentEnvItems([]);
          params.setTopbarError(false);
          params.setTopbarStatus("Console 在线");
          return;
        }

        params.setTopbarError(true);
        params.setTopbarStatus(`连接失败: ${message}`);
        params.showToast(`刷新失败: ${message}`, "error");
      } finally {
        params.setLoading(false);
      }
    },
    [params],
  );

  const handleSessionChange = useCallback(
    async (contextId: string) => {
      const nextContextId = String(contextId || "").trim();
      params.setSelectedSessionId(nextContextId);
      if (!params.selectedAgentId || !nextContextId) return;
      await Promise.all([
        params.refreshChannelHistory(params.selectedAgentId, nextContextId),
        params.refreshSessionMessages(params.selectedAgentId, nextContextId),
        params.refreshSessionArchives(params.selectedAgentId, nextContextId),
        params.refreshPrompt(params.selectedAgentId, nextContextId),
      ]);
    },
    [params],
  );

  return {
    refreshDashboard,
    handleSessionChange,
  };
}
