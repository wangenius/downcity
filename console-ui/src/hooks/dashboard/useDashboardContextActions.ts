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
  isConsoleUiContext,
} from "./shared";
import type {
  UiChatDeleteResponse,
  UiChatHistoryEvent,
  UiContextArchiveSummary,
  UiContextClearResponse,
  UiContextSummary,
  UiContextTimelineMessage,
  UiPromptResponse,
} from "../../types/Dashboard";
import type { DashboardToastType } from "../../types/DashboardHook";

function clearContextViewState(params: {
  setSelectedContextId?: (value: string) => void;
  setChannelHistory: (value: UiChatHistoryEvent[]) => void;
  setContextMessages: (value: UiContextTimelineMessage[]) => void;
  setContextArchives: (value: UiContextArchiveSummary[]) => void;
  setSelectedArchiveId: (value: string) => void;
  setContextArchiveMessages: (value: UiContextTimelineMessage[]) => void;
  setPrompt: (value: UiPromptResponse | null) => void;
}): void {
  params.setSelectedContextId?.("");
  params.setChannelHistory([]);
  params.setContextMessages([]);
  params.setContextArchives([]);
  params.setSelectedArchiveId("");
  params.setContextArchiveMessages([]);
  params.setPrompt(null);
}

function resolveNextContextId(params: {
  contexts: UiContextSummary[];
  currentContextId: string;
}): string {
  const preservedCurrent =
    params.contexts.find((item) => item.contextId === params.currentContextId)?.contextId || "";
  const consoleUiContext =
    params.contexts.find((item) => item.contextId === CONSOLEUI_CONTEXT_ID)?.contextId || "";
  const fallbackContext = params.contexts[0]?.contextId || "";
  return preservedCurrent || consoleUiContext || fallbackContext;
}

export function useDashboardContextActions(params: {
  requestJson: <T>(
    path: string,
    options?: RequestInit,
    preferredAgentId?: string,
  ) => Promise<T>;
  selectedAgentId: string;
  chatInput: string;
  sending: boolean;
  clearingContextMessages: boolean;
  clearingChatHistory: boolean;
  deletingContextId: string;
  selectedContextIdRef: MutableRefObject<string>;
  setSending: (value: boolean) => void;
  setClearingContextMessages: (value: boolean) => void;
  setClearingChatHistory: (value: boolean) => void;
  setDeletingContextId: (value: string) => void;
  setChatInput: (value: string) => void;
  setSelectedContextId: (value: string) => void;
  setChannelHistory: (value: UiChatHistoryEvent[]) => void;
  setContextMessages: (value: UiContextTimelineMessage[]) => void;
  setContextArchives: (value: UiContextArchiveSummary[]) => void;
  setSelectedArchiveId: (value: string) => void;
  setContextArchiveMessages: (value: UiContextTimelineMessage[]) => void;
  setPrompt: (value: UiPromptResponse | null) => void;
  refreshLocalChat: (agentId: string) => Promise<void>;
  refreshChannelHistory: (agentId: string, contextId: string) => Promise<void>;
  refreshContextMessages: (agentId: string, contextId: string) => Promise<void>;
  refreshContextArchives: (agentId: string, contextId: string) => Promise<UiContextArchiveSummary[]>;
  refreshPrompt: (agentId: string, contextId?: string) => Promise<void>;
  refreshLogs: (agentId: string) => Promise<void>;
  refreshOverview: (agentId: string) => Promise<void>;
  refreshContexts: (agentId: string) => Promise<UiContextSummary[]>;
  refreshChatChannels: (agentId: string) => Promise<unknown>;
  showToast: (message: string, type?: DashboardToastType) => void;
}): {
  sendConsoleUiMessage: () => Promise<void>;
  clearContextMessages: (contextIdInput: string) => Promise<void>;
  clearChatHistory: (contextIdInput: string) => Promise<void>;
  deleteChatContext: (contextIdInput: string) => Promise<boolean>;
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
      const currentContextId = String(params.selectedContextIdRef.current || "").trim();
      const targetContextId =
        currentContextId.startsWith("consoleui-") || currentContextId === "local_ui"
          ? currentContextId
          : CONSOLEUI_CONTEXT_ID;
      await params.requestJson(dashboardApiRoutes.contextExecute(targetContextId), {
        method: "POST",
        body: JSON.stringify({ instructions }),
      });
      params.setChatInput("");
      await Promise.all([
        params.refreshLocalChat(params.selectedAgentId),
        params.refreshChannelHistory(params.selectedAgentId, targetContextId),
        params.refreshContextMessages(params.selectedAgentId, targetContextId),
        params.refreshContextArchives(params.selectedAgentId, targetContextId),
        params.refreshPrompt(params.selectedAgentId, targetContextId),
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

  const clearContextMessages = useCallback(
    async (contextIdInput: string) => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return;
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return;
      }
      if (params.clearingContextMessages) return;

      params.setClearingContextMessages(true);
      try {
        await params.requestJson<UiContextClearResponse>(
          dashboardApiRoutes.contextClearMessages(contextId),
          { method: "DELETE" },
          params.selectedAgentId,
        );
        await Promise.all([
          params.refreshContexts(params.selectedAgentId),
          params.refreshChannelHistory(params.selectedAgentId, contextId),
          params.refreshContextMessages(params.selectedAgentId, contextId),
          params.refreshContextArchives(params.selectedAgentId, contextId),
          params.refreshPrompt(params.selectedAgentId, contextId),
          params.refreshOverview(params.selectedAgentId),
          params.refreshLogs(params.selectedAgentId),
        ]);
        params.showToast("context messages 已清理", "success");
      } catch (error) {
        params.showToast(`清理 context messages 失败: ${getErrorMessage(error)}`, "error");
      } finally {
        params.setClearingContextMessages(false);
      }
    },
    [params],
  );

  const clearChatHistory = useCallback(
    async (contextIdInput: string) => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return;
      if (isConsoleUiContext(contextId)) {
        await clearContextMessages(contextId);
        return;
      }
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return;
      }
      if (params.clearingChatHistory) return;

      params.setClearingChatHistory(true);
      try {
        await params.requestJson<UiContextClearResponse>(
          dashboardApiRoutes.contextClearChatHistory(contextId),
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
    [clearContextMessages, params],
  );

  const deleteChatContext = useCallback(
    async (contextIdInput: string): Promise<boolean> => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return false;
      if (!params.selectedAgentId) {
        params.showToast("当前无可用 agent", "error");
        return false;
      }
      if (params.deletingContextId) return false;

      params.setDeletingContextId(contextId);
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

        const contextList = await params.refreshContexts(params.selectedAgentId);
        const nextContextId = resolveNextContextId({
          contexts: contextList,
          currentContextId: String(params.selectedContextIdRef.current || "").trim(),
        });

        if (nextContextId) {
          params.setSelectedContextId(nextContextId);
          await Promise.all([
            params.refreshChannelHistory(params.selectedAgentId, nextContextId),
            params.refreshContextMessages(params.selectedAgentId, nextContextId),
            params.refreshContextArchives(params.selectedAgentId, nextContextId),
            params.refreshPrompt(params.selectedAgentId, nextContextId),
          ]);
        } else {
          clearContextViewState({
            setSelectedContextId: params.setSelectedContextId,
            setChannelHistory: params.setChannelHistory,
            setContextMessages: params.setContextMessages,
            setContextArchives: params.setContextArchives,
            setSelectedArchiveId: params.setSelectedArchiveId,
            setContextArchiveMessages: params.setContextArchiveMessages,
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
          deleted ? `已删除 context: ${contextId}` : `context 不存在，已同步状态: ${contextId}`,
          "success",
        );
        return deleted;
      } catch (error) {
        params.showToast(`删除 context 失败: ${getErrorMessage(error)}`, "error");
        return false;
      } finally {
        params.setDeletingContextId("");
      }
    },
    [params],
  );

  return {
    sendConsoleUiMessage,
    clearContextMessages,
    clearChatHistory,
    deleteChatContext,
  };
}
