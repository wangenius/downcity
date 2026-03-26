/**
 * Console Dashboard 上下文写操作 Hook。
 *
 * 关键点（中文）
 * - 聚合 consoleui 消息发送、上下文清理、聊天历史清理、context 删除。
 * - 保持主 hook 只负责拼装状态，不直接承载长串副作用流程。
 */

import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { dashboardApiRoutes } from "../../lib/dashboard-api";
import {
  CONSOLEUI_CONTEXT_ID,
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
  contexts: UiSessionSummary[];
  currentSessionId: string;
}): string {
  const preservedCurrent =
    params.contexts.find((item) => item.contextId === params.currentSessionId)?.contextId || "";
  const consoleUiSession =
    params.contexts.find((item) => item.contextId === CONSOLEUI_CONTEXT_ID)?.contextId || "";
  const fallbackSession = params.contexts[0]?.contextId || "";
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
  refreshChannelHistory: (agentId: string, contextId: string) => Promise<void>;
  refreshSessionMessages: (agentId: string, contextId: string) => Promise<void>;
  refreshSessionArchives: (agentId: string, contextId: string) => Promise<UiSessionArchiveSummary[]>;
  refreshPrompt: (agentId: string, contextId?: string) => Promise<void>;
  refreshLogs: (agentId: string) => Promise<void>;
  refreshOverview: (agentId: string) => Promise<void>;
  refreshSessions: (agentId: string) => Promise<UiSessionSummary[]>;
  refreshChatChannels: (agentId: string) => Promise<unknown>;
  showToast: (message: string, type?: DashboardToastType) => void;
}): {
  sendConsoleUiMessage: () => Promise<void>;
  clearSessionMessages: (contextIdInput: string) => Promise<void>;
  clearChatHistory: (contextIdInput: string) => Promise<void>;
  deleteChatSession: (contextIdInput: string) => Promise<boolean>;
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
          : CONSOLEUI_CONTEXT_ID;
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
    async (contextIdInput: string) => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return;
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return;
      }
      if (params.clearingSessionMessages) return;

      params.setClearingSessionMessages(true);
      try {
        await params.requestJson<UiSessionClearResponse>(
          dashboardApiRoutes.sessionClearMessages(contextId),
          { method: "DELETE" },
          params.selectedAgentId,
        );
        await Promise.all([
          params.refreshSessions(params.selectedAgentId),
          params.refreshChannelHistory(params.selectedAgentId, contextId),
          params.refreshSessionMessages(params.selectedAgentId, contextId),
          params.refreshSessionArchives(params.selectedAgentId, contextId),
          params.refreshPrompt(params.selectedAgentId, contextId),
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
    async (contextIdInput: string) => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return;
      if (isConsoleUiSession(contextId)) {
        await clearSessionMessages(contextId);
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
          dashboardApiRoutes.sessionClearChatHistory(contextId),
          { method: "DELETE" },
          params.selectedAgentId,
        );
        await Promise.all([
          params.refreshChannelHistory(params.selectedAgentId, contextId),
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
    async (contextIdInput: string): Promise<boolean> => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return false;
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return false;
      }
      if (params.deletingSessionId) return false;

      params.setDeletingSessionId(contextId);
      try {
        const data = await params.requestJson<UiChatDeleteResponse>(
          dashboardApiRoutes.servicesCommand(),
          {
            method: "POST",
            body: JSON.stringify({
              serviceName: "chat",
              command: "delete",
              payload: { contextId },
            }),
          },
          params.selectedAgentId,
        );
        const deleted = data?.data?.deleted === true;

        const contextList = await params.refreshSessions(params.selectedAgentId);
        const nextSessionId = resolveNextSessionId({
          contexts: contextList,
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
          deleted ? `已删除 session: ${contextId}` : `context 不存在，已同步状态: ${contextId}`,
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

export const useDashboardContextActions = useDashboardSessionActions;
