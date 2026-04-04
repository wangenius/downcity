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
import {
  CONSOLEUI_SESSION_ID,
  getErrorMessage,
  isAgentUnavailableError,
  isUnauthorizedError,
} from "./shared";
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
    params.sessions.find((item) => item.sessionId === params.currentSessionId)?.sessionId || "";
  const consoleUi =
    params.sessions.find((item) => item.sessionId === CONSOLEUI_SESSION_ID)?.sessionId || "";
  const fallback = params.sessions[0]?.sessionId || "";
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
  refreshChannelHistory: (agentId: string, sessionId: string) => Promise<void>;
  refreshSessionMessages: (agentId: string, sessionId: string) => Promise<void>;
  refreshSessionArchives: (agentId: string, sessionId: string) => Promise<UiSessionArchiveSummary[]>;
  refreshPrompt: (agentId: string, sessionId?: string) => Promise<void>;
  showToast: (message: string, type?: DashboardToastType) => void;
  setAuthRequired: (value: boolean) => void;
}): {
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  handleSessionChange: (sessionId: string) => Promise<void>;
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

        const nextSessionId = resolveNextSessionId({
          sessions: sessionList,
          currentSessionId: String(params.selectedSessionIdRef.current || "").trim(),
        });
        params.setSelectedSessionId(nextSessionId);

        if (nextSessionId) {
          await Promise.all([
            params.refreshChannelHistory(nextAgentId, nextSessionId),
            params.refreshSessionMessages(nextAgentId, nextSessionId),
            params.refreshSessionArchives(nextAgentId, nextSessionId),
            params.refreshPrompt(nextAgentId, nextSessionId),
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

        params.setAuthRequired(false);
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

        if (isUnauthorizedError(error)) {
          params.setAuthRequired(true);
          params.setTopbarError(true);
          params.setTopbarStatus("需要登录");
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
    async (sessionId: string) => {
      const nextSessionId = String(sessionId || "").trim();
      params.setSelectedSessionId(nextSessionId);
      if (!params.selectedAgentId || !nextSessionId) return;
      await Promise.all([
        params.refreshChannelHistory(params.selectedAgentId, nextSessionId),
        params.refreshSessionMessages(params.selectedAgentId, nextSessionId),
        params.refreshSessionArchives(params.selectedAgentId, nextSessionId),
        params.refreshPrompt(params.selectedAgentId, nextSessionId),
      ]);
    },
    [params],
  );

  return {
    refreshDashboard,
    handleSessionChange,
  };
}
