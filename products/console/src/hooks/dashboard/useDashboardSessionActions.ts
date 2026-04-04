/**
 * Console Dashboard session 写操作 Hook。
 *
 * 关键点（中文）
 * - 聚合 consoleui 消息发送、session 清理、聊天历史清理、session 删除。
 * - 保持主 hook 只负责拼装状态，不直接承载长串副作用流程。
 */

import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { dashboardApiRoutes } from "../../lib/dashboard-api";
import {
  CONSOLEUI_SESSION_ID,
  getErrorMessage,
  isConsoleUiSession,
} from "./shared";
import type {
  UiChatDeleteResponse,
  UiChatHistoryEvent,
  UiSessionArchiveSummary,
  UiSessionClearResponse,
  UiSessionSummary,
  UiSessionTimelineMessage,
  UiPromptResponse,
} from "../../types/Dashboard";
import type { DashboardToastType } from "../../types/DashboardHook";

function clearSessionViewState(params: {
  setSelectedSessionId?: (value: string) => void;
  setChannelHistory: (value: UiChatHistoryEvent[]) => void;
  setSessionMessages: (value: UiSessionTimelineMessage[]) => void;
  setSessionArchives: (value: UiSessionArchiveSummary[]) => void;
  setSelectedArchiveId: (value: string) => void;
  setSessionArchiveMessages: (value: UiSessionTimelineMessage[]) => void;
  setPrompt: (value: UiPromptResponse | null) => void;
}): void {
  params.setSelectedSessionId?.("");
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
  const preservedCurrent =
    params.sessions.find((item) => item.sessionId === params.currentSessionId)?.sessionId || "";
  const consoleUiSession =
    params.sessions.find((item) => item.sessionId === CONSOLEUI_SESSION_ID)?.sessionId || "";
  const fallbackSession = params.sessions[0]?.sessionId || "";
  return preservedCurrent || consoleUiSession || fallbackSession;
}

export function useDashboardSessionActions(params: {
  requestJson: <T>(
    path: string,
    options?: RequestInit,
    preferredAgentId?: string,
  ) => Promise<T>;
  selectedAgentId: string;
  chatInput: string;
  sending: boolean;
  clearingSessionMessages: boolean;
  clearingChatHistory: boolean;
  deletingSessionId: string;
  selectedSessionIdRef: MutableRefObject<string>;
  setSending: (value: boolean) => void;
  setClearingSessionMessages: (value: boolean) => void;
  setClearingChatHistory: (value: boolean) => void;
  setDeletingSessionId: (value: string) => void;
  setChatInput: (value: string) => void;
  setSelectedSessionId: (value: string) => void;
  setChannelHistory: (value: UiChatHistoryEvent[]) => void;
  setSessionMessages: (value: UiSessionTimelineMessage[]) => void;
  setSessionArchives: (value: UiSessionArchiveSummary[]) => void;
  setSelectedArchiveId: (value: string) => void;
  setSessionArchiveMessages: (value: UiSessionTimelineMessage[]) => void;
  setPrompt: (value: UiPromptResponse | null) => void;
  refreshLocalChat: (agentId: string) => Promise<void>;
  refreshChannelHistory: (agentId: string, sessionId: string) => Promise<void>;
  refreshSessionMessages: (agentId: string, sessionId: string) => Promise<void>;
  refreshSessionArchives: (agentId: string, sessionId: string) => Promise<UiSessionArchiveSummary[]>;
  refreshPrompt: (agentId: string, sessionId?: string) => Promise<void>;
  refreshLogs: (agentId: string) => Promise<void>;
  refreshOverview: (agentId: string) => Promise<void>;
  refreshSessions: (agentId: string) => Promise<UiSessionSummary[]>;
  refreshChatChannels: (agentId: string) => Promise<unknown>;
  showToast: (message: string, type?: DashboardToastType) => void;
}): {
  sendConsoleUiMessage: () => Promise<void>;
  clearSessionMessages: (sessionIdInput: string) => Promise<void>;
  clearChatHistory: (sessionIdInput: string) => Promise<void>;
  deleteChatSession: (sessionIdInput: string) => Promise<boolean>;
} {
  const sendConsoleUiMessage = useCallback(async () => {
    if (params.sending) return;
    const instructions = params.chatInput.trim();
    if (!instructions) return;
    if (!params.selectedAgentId) {
      params.showToast("当前无可用 agent", "error");
      return;
    }

    params.setSending(true);
    try {
      const currentSessionId = String(params.selectedSessionIdRef.current || "").trim();
      const targetSessionId =
        currentSessionId.startsWith("consoleui-") || currentSessionId === "local_ui"
          ? currentSessionId
          : CONSOLEUI_SESSION_ID;
      await params.requestJson(dashboardApiRoutes.sessionExecute(targetSessionId), {
        method: "POST",
        body: JSON.stringify({ instructions }),
      });
      params.setChatInput("");
      await Promise.all([
        params.refreshLocalChat(params.selectedAgentId),
        params.refreshChannelHistory(params.selectedAgentId, targetSessionId),
        params.refreshSessionMessages(params.selectedAgentId, targetSessionId),
        params.refreshSessionArchives(params.selectedAgentId, targetSessionId),
        params.refreshPrompt(params.selectedAgentId, targetSessionId),
        params.refreshLogs(params.selectedAgentId),
        params.refreshOverview(params.selectedAgentId),
      ]);
      params.showToast("已发送到 consoleui channel", "success");
    } catch (error) {
      params.showToast(`发送失败: ${getErrorMessage(error)}`, "error");
    } finally {
      params.setSending(false);
    }
  }, [params]);

  const clearSessionMessages = useCallback(
    async (sessionIdInput: string) => {
      const sessionId = String(sessionIdInput || "").trim();
      if (!sessionId) return;
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return;
      }
      if (params.clearingSessionMessages) return;

      params.setClearingSessionMessages(true);
      try {
        await params.requestJson<UiSessionClearResponse>(
          dashboardApiRoutes.sessionClearMessages(sessionId),
          { method: "DELETE" },
          params.selectedAgentId,
        );
        await Promise.all([
          params.refreshSessions(params.selectedAgentId),
          params.refreshChannelHistory(params.selectedAgentId, sessionId),
          params.refreshSessionMessages(params.selectedAgentId, sessionId),
          params.refreshSessionArchives(params.selectedAgentId, sessionId),
          params.refreshPrompt(params.selectedAgentId, sessionId),
          params.refreshOverview(params.selectedAgentId),
          params.refreshLogs(params.selectedAgentId),
        ]);
        params.showToast("session messages 已清理", "success");
      } catch (error) {
        params.showToast(`清理 session messages 失败: ${getErrorMessage(error)}`, "error");
      } finally {
        params.setClearingSessionMessages(false);
      }
    },
    [params],
  );

  const clearChatHistory = useCallback(
    async (sessionIdInput: string) => {
      const sessionId = String(sessionIdInput || "").trim();
      if (!sessionId) return;
      if (isConsoleUiSession(sessionId)) {
        await clearSessionMessages(sessionId);
        return;
      }
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return;
      }
      if (params.clearingChatHistory) return;

      params.setClearingChatHistory(true);
      try {
        await params.requestJson<UiSessionClearResponse>(
          dashboardApiRoutes.sessionClearChatHistory(sessionId),
          { method: "DELETE" },
          params.selectedAgentId,
        );
        await Promise.all([
          params.refreshChannelHistory(params.selectedAgentId, sessionId),
          params.refreshLogs(params.selectedAgentId),
        ]);
        params.showToast("chat history 已清理", "success");
      } catch (error) {
        params.showToast(`清理 chat history 失败: ${getErrorMessage(error)}`, "error");
      } finally {
        params.setClearingChatHistory(false);
      }
    },
    [clearSessionMessages, params],
  );

  const deleteChatSession = useCallback(
    async (sessionIdInput: string): Promise<boolean> => {
      const sessionId = String(sessionIdInput || "").trim();
      if (!sessionId) return false;
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return false;
      }
      if (params.deletingSessionId) return false;

      params.setDeletingSessionId(sessionId);
      try {
        const data = await params.requestJson<UiChatDeleteResponse>(
          dashboardApiRoutes.servicesCommand(),
          {
            method: "POST",
            body: JSON.stringify({
              serviceName: "chat",
              command: "delete",
              payload: { sessionId },
            }),
          },
          params.selectedAgentId,
        );
        const deleted = data?.data?.deleted === true;

        const sessionList = await params.refreshSessions(params.selectedAgentId);
        const nextSessionId = resolveNextSessionId({
          sessions: sessionList,
          currentSessionId: String(params.selectedSessionIdRef.current || "").trim(),
        });

        if (nextSessionId) {
          params.setSelectedSessionId(nextSessionId);
          await Promise.all([
            params.refreshChannelHistory(params.selectedAgentId, nextSessionId),
            params.refreshSessionMessages(params.selectedAgentId, nextSessionId),
            params.refreshSessionArchives(params.selectedAgentId, nextSessionId),
            params.refreshPrompt(params.selectedAgentId, nextSessionId),
          ]);
        } else {
          clearSessionViewState({
            setSelectedSessionId: params.setSelectedSessionId,
            setChannelHistory: params.setChannelHistory,
            setSessionMessages: params.setSessionMessages,
            setSessionArchives: params.setSessionArchives,
            setSelectedArchiveId: params.setSelectedArchiveId,
            setSessionArchiveMessages: params.setSessionArchiveMessages,
            setPrompt: params.setPrompt,
          });
        }

        await Promise.all([
          params.refreshChatChannels(params.selectedAgentId),
          params.refreshOverview(params.selectedAgentId),
          params.refreshLogs(params.selectedAgentId),
          params.refreshLocalChat(params.selectedAgentId),
        ]);

        params.showToast(
          deleted ? `已删除 session: ${sessionId}` : `session 不存在，已同步状态: ${sessionId}`,
          "success",
        );
        return deleted;
      } catch (error) {
        params.showToast(`删除 session 失败: ${getErrorMessage(error)}`, "error");
        return false;
      } finally {
        params.setDeletingSessionId("");
      }
    },
    [params],
  );

  return {
    sendConsoleUiMessage,
    clearSessionMessages,
    clearChatHistory,
    deleteChatSession,
  };
}
