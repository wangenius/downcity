/**
 * Console Dashboard 状态与行为管理。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  UiAgentOption,
  UiAgentsResponse,
  UiChatActionResult,
  UiChatChannelStatus,
  UiChatHistoryEvent,
  UiChatStatusResponse,
  UiContextMessagesResponse,
  UiContextSummary,
  UiContextsResponse,
  UiContextTimelineMessage,
  UiLocalMessage,
  UiLocalMessagesResponse,
  UiLogItem,
  UiLogsResponse,
  UiOverviewResponse,
  UiPromptResponse,
  UiExtensionRuntimeItem,
  UiExtensionsResponse,
  UiServiceItem,
  UiServicesResponse,
  UiTaskItem,
  UiTasksResponse,
} from "../types/Dashboard";

const LOCAL_UI_CONTEXT_ID = "local_ui";
const AGENT_STORAGE_KEY = "sma_console_ui_selected_agent";

type ToastType = "info" | "success" | "error";

interface ToastState {
  /**
   * 提示文案。
   */
  message: string;
  /**
   * 提示类型。
   */
  type: ToastType;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function statusBadgeVariant(raw?: string): "ok" | "warn" | "bad" {
  const value = String(raw || "").toLowerCase();
  if (["running", "ok", "active", "enabled", "success"].includes(value)) return "ok";
  if (["stopped", "disabled", "paused", "error", "failed", "offline"].includes(value)) return "bad";
  return "warn";
}

function formatTime(ts?: number | string): string {
  if (ts === undefined || ts === null) return "-";
  const value = typeof ts === "number" ? ts : Date.parse(String(ts));
  if (!Number.isFinite(value) || Number.isNaN(value)) return "-";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function inferChannelFromContextId(contextId: string): string {
  const value = String(contextId || "").trim().toLowerCase();
  if (value.startsWith("telegram-chat-")) return "telegram";
  if (value.startsWith("feishu-chat-")) return "feishu";
  if (value.startsWith("qq-")) return "qq";
  return "";
}

export interface UseConsoleDashboardResult {
  /**
   * 当前 agent 列表。
   */
  agents: UiAgentOption[];
  /**
   * 当前选中的 agent id。
   */
  selectedAgentId: string;
  /**
   * 当前选中 agent 对象。
   */
  selectedAgent: UiAgentOption | null;
  /**
   * dashboard 概览数据。
   */
  overview: UiOverviewResponse | null;
  /**
   * service 状态列表。
   */
  services: UiServiceItem[];
  /**
   * extension 状态列表。
   */
  extensions: UiExtensionRuntimeItem[];
  /**
   * chat 渠道状态列表。
   */
  chatChannels: UiChatChannelStatus[];
  /**
   * context 摘要列表。
   */
  contexts: UiContextSummary[];
  /**
   * 当前选中的渠道。
   */
  selectedChannel: string;
  /**
   * 当前选中的 contextId。
   */
  selectedContextId: string;
  /**
   * chat history 事件列表。
   */
  channelHistory: UiChatHistoryEvent[];
  /**
   * context 时间线消息列表。
   */
  contextMessages: UiContextTimelineMessage[];
  /**
   * 任务状态列表。
   */
  tasks: UiTaskItem[];
  /**
   * 近期日志列表。
   */
  logs: UiLogItem[];
  /**
   * system prompt 数据。
   */
  prompt: UiPromptResponse | null;
  /**
   * local_ui 消息列表。
   */
  localMessages: UiLocalMessage[];
  /**
   * 顶栏状态文本。
   */
  topbarStatus: string;
  /**
   * 顶栏是否错误状态。
   */
  topbarError: boolean;
  /**
   * 是否正在刷新。
   */
  loading: boolean;
  /**
   * 是否正在发送 local_ui 消息。
   */
  sending: boolean;
  /**
   * local_ui 输入框内容。
   */
  chatInput: string;
  /**
   * toast 状态。
   */
  toast: ToastState | null;
  /**
   * 更新输入框内容。
   */
  setChatInput: (value: string) => void;
  /**
   * 手动切换 agent。
   */
  handleAgentChange: (nextAgentId: string) => void;
  /**
   * 切换当前渠道。
   */
  handleChannelChange: (channel: string) => Promise<void>;
  /**
   * 切换当前 context。
   */
  handleContextChange: (contextId: string) => Promise<void>;
  /**
   * 手动刷新 dashboard。
   */
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  /**
   * 刷新 chat 渠道状态。
   */
  refreshChatChannels: (agentId: string) => Promise<UiChatChannelStatus[]>;
  /**
   * 刷新 extension 状态。
   */
  refreshExtensions: (agentId: string) => Promise<void>;
  /**
   * 刷新 context 列表。
   */
  refreshContexts: (agentId: string) => Promise<UiContextSummary[]>;
  /**
   * 刷新 chat history。
   */
  refreshChannelHistory: (agentId: string, contextId: string) => Promise<void>;
  /**
   * 刷新 context message 历史。
   */
  refreshContextMessages: (agentId: string, contextId: string) => Promise<void>;
  /**
   * 刷新 prompt。
   */
  refreshPrompt: (agentId: string) => Promise<void>;
  /**
   * 刷新 local_ui 消息。
   */
  refreshLocalChat: (agentId: string) => Promise<void>;
  /**
   * 控制 service。
   */
  controlService: (serviceName: string, action: string) => Promise<void>;
  /**
   * 控制 extension。
   */
  controlExtension: (extensionName: string, action: "start" | "stop" | "restart") => Promise<void>;
  /**
   * 执行 chat 渠道动作。
   */
  runChatChannelAction: (action: "test" | "reconnect", channel: string) => Promise<void>;
  /**
   * 触发 task 运行。
   */
  runTask: (taskId: string) => Promise<void>;
  /**
   * 发送 local_ui 指令。
   */
  sendLocalMessage: () => Promise<void>;
  /**
   * 提供常用常量。
   */
  constants: {
    LOCAL_UI_CONTEXT_ID: string;
  };
  /**
   * UI 工具函数。
   */
  uiHelpers: {
    formatTime: (ts?: number | string) => string;
    statusBadgeVariant: (status?: string) => "ok" | "warn" | "bad";
  };
}

export function useConsoleDashboard(): UseConsoleDashboardResult {
  const [agents, setAgents] = useState<UiAgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const [overview, setOverview] = useState<UiOverviewResponse | null>(null);
  const [services, setServices] = useState<UiServiceItem[]>([]);
  const [extensions, setExtensions] = useState<UiExtensionRuntimeItem[]>([]);
  const [chatChannels, setChatChannels] = useState<UiChatChannelStatus[]>([]);
  const [contexts, setContexts] = useState<UiContextSummary[]>([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [selectedContextId, setSelectedContextId] = useState("");
  const [channelHistory, setChannelHistory] = useState<UiChatHistoryEvent[]>([]);
  const [contextMessages, setContextMessages] = useState<UiContextTimelineMessage[]>([]);
  const [tasks, setTasks] = useState<UiTaskItem[]>([]);
  const [logs, setLogs] = useState<UiLogItem[]>([]);
  const [prompt, setPrompt] = useState<UiPromptResponse | null>(null);
  const [localMessages, setLocalMessages] = useState<UiLocalMessage[]>([]);

  const [topbarStatus, setTopbarStatus] = useState("连接中...");
  const [topbarError, setTopbarError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || null,
    [agents, selectedAgentId],
  );

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    setToast({ message, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const withSelectedAgent = useCallback(
    (path: string, preferredAgentId?: string): string => {
      const rawPath = String(path || "");
      if (!rawPath.startsWith("/api/")) return rawPath;
      if (rawPath.startsWith("/api/ui/")) return rawPath;
      const agentId = preferredAgentId ?? selectedAgentId;
      if (!agentId) return rawPath;
      const url = new URL(rawPath, window.location.origin);
      url.searchParams.set("agent", agentId);
      return `${url.pathname}${url.search}`;
    },
    [selectedAgentId],
  );

  const requestJson = useCallback(
    async <T,>(path: string, options: RequestInit = {}, preferredAgentId?: string): Promise<T> => {
      const response = await fetch(withSelectedAgent(path, preferredAgentId), {
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
        ...options,
      });

      const raw = await response.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        body = null;
      }

      if (!response.ok) {
        const errorMessage =
          typeof body?.error === "string"
            ? body.error
            : typeof body?.message === "string"
              ? body.message
              : `${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }

      if (body && body.success === false) {
        const failMessage =
          typeof body.error === "string"
            ? body.error
            : typeof body.message === "string"
              ? body.message
              : "request failed";
        throw new Error(failMessage);
      }

      if (body === null) {
        throw new Error(`Invalid JSON response from ${path}`);
      }

      return body as T;
    },
    [withSelectedAgent],
  );

  const clearPanelDataForNoAgent = useCallback(() => {
    setOverview(null);
    setServices([]);
    setExtensions([]);
    setChatChannels([]);
    setContexts([]);
    setSelectedChannel("");
    setSelectedContextId("");
    setChannelHistory([]);
    setContextMessages([]);
    setTasks([]);
    setLogs([]);
    setPrompt(null);
    setLocalMessages([]);
  }, []);

  const refreshAgents = useCallback(
    async (preferredAgentId?: string): Promise<{ nextAgentId: string; list: UiAgentOption[] }> => {
      const cachedId = localStorage.getItem(AGENT_STORAGE_KEY) || "";
      const preferred = preferredAgentId || selectedAgentId || cachedId;
      const endpoint = preferred
        ? `/api/ui/agents?agent=${encodeURIComponent(preferred)}`
        : "/api/ui/agents";
      const data = await requestJson<UiAgentsResponse>(endpoint);

      const list = Array.isArray(data.agents) ? data.agents : [];
      const nextId = String(data.selectedAgentId || list[0]?.id || "");
      setAgents(list);
      setSelectedAgentId(nextId);

      if (nextId) {
        localStorage.setItem(AGENT_STORAGE_KEY, nextId);
      } else {
        localStorage.removeItem(AGENT_STORAGE_KEY);
      }

      return { nextAgentId: nextId, list };
    },
    [requestJson, selectedAgentId],
  );

  const refreshOverview = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiOverviewResponse>("/api/tui/overview?contextLimit=40", {}, agentId);
      setOverview(data);
    },
    [requestJson],
  );

  const refreshServices = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiServicesResponse>("/api/tui/services", {}, agentId);
      setServices(Array.isArray(data.services) ? data.services : []);
    },
    [requestJson],
  );

  const refreshExtensions = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiExtensionsResponse>("/api/extensions/list", {}, agentId);
      setExtensions(Array.isArray(data.extensions) ? data.extensions : []);
    },
    [requestJson],
  );

  const refreshChatChannels = useCallback(
    async (agentId: string): Promise<UiChatChannelStatus[]> => {
      if (!agentId) return [];
      try {
        const data = await requestJson<UiChatStatusResponse>(
          "/api/services/command",
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
        setChatChannels(channels);
        return channels;
      } catch (error) {
        const message = getErrorMessage(error);
        // 关键点（中文）：兼容旧 runtime 不支持 chat.status 的场景。
        if (/404|not found|unknown action|unknown service/i.test(message)) {
          setChatChannels([]);
          return [];
        }
        throw error;
      }
    },
    [requestJson],
  );

  const refreshContexts = useCallback(
    async (agentId: string): Promise<UiContextSummary[]> => {
      if (!agentId) return [];
      const data = await requestJson<UiContextsResponse>("/api/tui/contexts?limit=120", {}, agentId);
      const list = Array.isArray(data.contexts) ? data.contexts : [];
      setContexts(list);
      return list;
    },
    [requestJson],
  );

  const refreshChannelHistory = useCallback(
    async (agentId: string, contextId: string) => {
      if (!agentId || !contextId) return;
      const data = await requestJson<UiChatStatusResponse>(
        "/api/services/command",
        {
          method: "POST",
          body: JSON.stringify({
            serviceName: "chat",
            command: "history",
            payload: {
              contextId,
              limit: 80,
            },
          }),
        },
        agentId,
      );
      const events = Array.isArray(data?.data?.events) ? data.data.events : [];
      setChannelHistory(events);
    },
    [requestJson],
  );

  const refreshContextMessages = useCallback(
    async (agentId: string, contextId: string) => {
      if (!agentId || !contextId) return;
      const data = await requestJson<UiContextMessagesResponse>(
        `/api/tui/contexts/${encodeURIComponent(contextId)}/messages?limit=100`,
        {},
        agentId,
      );
      setContextMessages(Array.isArray(data.messages) ? data.messages : []);
    },
    [requestJson],
  );

  const refreshTasks = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiTasksResponse>("/api/tui/tasks", {}, agentId);
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    },
    [requestJson],
  );

  const refreshLogs = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiLogsResponse>("/api/tui/logs?limit=260", {}, agentId);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    },
    [requestJson],
  );

  const refreshPrompt = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        const data = await requestJson<UiPromptResponse>(
          `/api/tui/system-prompt?contextId=${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}`,
          {},
          agentId,
        );
        setPrompt(data);
      } catch (error) {
        const message = getErrorMessage(error);
        // 关键点（中文）：旧 runtime 没有 system-prompt 接口时降级为空。
        if (/404|not found/i.test(message)) {
          setPrompt(null);
          return;
        }
        throw error;
      }
    },
    [requestJson],
  );

  const refreshLocalChat = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      const data = await requestJson<UiLocalMessagesResponse>(
        `/api/tui/contexts/${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}/messages?limit=80`,
        {},
        agentId,
      );
      setLocalMessages(Array.isArray(data.messages) ? data.messages : []);
    },
    [requestJson],
  );

  const refreshDashboard = useCallback(
    async (preferredAgentId?: string) => {
      setLoading(true);
      try {
        const { nextAgentId, list } = await refreshAgents(preferredAgentId);
        if (!nextAgentId) {
          clearPanelDataForNoAgent();
          setTopbarError(false);
          setTopbarStatus("未检测到运行中的 agent");
          return;
        }

        const [channels, contextList] = await Promise.all([
          refreshChatChannels(nextAgentId),
          refreshContexts(nextAgentId),
        ]);

        await Promise.all([
          refreshOverview(nextAgentId),
          refreshServices(nextAgentId),
          refreshExtensions(nextAgentId),
          refreshTasks(nextAgentId),
          refreshLogs(nextAgentId),
          refreshPrompt(nextAgentId),
          refreshLocalChat(nextAgentId),
        ]);

        const nextSelectedChannel = String(selectedChannel || channels[0]?.channel || "").trim();
        if (nextSelectedChannel) {
          setSelectedChannel(nextSelectedChannel);
        }

        const byCurrent = contextList.find((item) => item.contextId === selectedContextId)?.contextId || "";
        const byChannel =
          contextList.find((item) => inferChannelFromContextId(item.contextId) === nextSelectedChannel)?.contextId ||
          "";
        const fallback = contextList[0]?.contextId || "";
        const nextContext = byCurrent || byChannel || fallback;
        setSelectedContextId(nextContext);

        if (nextContext) {
          await Promise.all([
            refreshChannelHistory(nextAgentId, nextContext),
            refreshContextMessages(nextAgentId, nextContext),
          ]);
        } else {
          setChannelHistory([]);
          setContextMessages([]);
        }

        const selected = list.find((item) => item.id === nextAgentId);
        setTopbarError(false);
        setTopbarStatus(
          `在线 · ${selected?.name || "agent"} · ${selected?.host || "127.0.0.1"}:${selected?.port || "-"}`,
        );
      } catch (error) {
        const message = getErrorMessage(error);
        setTopbarError(true);
        setTopbarStatus(`连接失败: ${message}`);
        showToast(`刷新失败: ${message}`, "error");
      } finally {
        setLoading(false);
      }
    },
    [
      clearPanelDataForNoAgent,
      refreshAgents,
      refreshChatChannels,
      refreshChannelHistory,
      refreshContextMessages,
      refreshContexts,
      refreshExtensions,
      refreshLocalChat,
      refreshLogs,
      refreshOverview,
      refreshPrompt,
      refreshServices,
      refreshTasks,
      selectedChannel,
      selectedContextId,
      showToast,
    ],
  );

  const controlService = useCallback(
    async (serviceName: string, action: string) => {
      try {
        await requestJson("/api/services/control", {
          method: "POST",
          body: JSON.stringify({ serviceName, action }),
        });
        showToast(`service ${serviceName} ${action} 已执行`, "success");
        await refreshServices(selectedAgentId);
      } catch (error) {
        showToast(`service 操作失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshServices, requestJson, selectedAgentId, showToast],
  );

  const controlExtension = useCallback(
    async (extensionName: string, action: "start" | "stop" | "restart") => {
      try {
        await requestJson("/api/extensions/control", {
          method: "POST",
          body: JSON.stringify({ extensionName, action }),
        });
        showToast(`extension ${extensionName} ${action} 已执行`, "success");
        await refreshExtensions(selectedAgentId);
      } catch (error) {
        showToast(`extension 操作失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshExtensions, requestJson, selectedAgentId, showToast],
  );

  const runChatChannelAction = useCallback(
    async (action: "test" | "reconnect", channel: string) => {
      try {
        const payload = channel ? { channel } : {};
        const data = await requestJson<UiChatStatusResponse>("/api/services/command", {
          method: "POST",
          body: JSON.stringify({
            serviceName: "chat",
            command: action,
            payload,
          }),
        });

        if (action === "test") {
          const results = Array.isArray(data?.data?.results) ? data.data.results : [];
          const one: UiChatActionResult | undefined = channel
            ? results.find((item) => String(item.channel || "") === channel)
            : results[0];
          const message = String(one?.message || "test completed");
          showToast(`${channel || "chat"} test: ${message}`, one?.success ? "success" : "error");
        } else {
          showToast(`${channel || "chat"} ${action} 已执行`, "success");
        }

        await Promise.all([refreshChatChannels(selectedAgentId), refreshServices(selectedAgentId)]);
      } catch (error) {
        showToast(`chat ${action} 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshChatChannels, refreshServices, requestJson, selectedAgentId, showToast],
  );

  const handleChannelChange = useCallback(
    async (channel: string) => {
      const nextChannel = String(channel || "").trim();
      setSelectedChannel(nextChannel);
      const nextContext =
        contexts.find((item) => inferChannelFromContextId(item.contextId) === nextChannel)?.contextId || "";
      if (!nextContext) return;
      setSelectedContextId(nextContext);
      if (!selectedAgentId) return;
      await Promise.all([
        refreshChannelHistory(selectedAgentId, nextContext),
        refreshContextMessages(selectedAgentId, nextContext),
      ]);
    },
    [contexts, refreshChannelHistory, refreshContextMessages, selectedAgentId],
  );

  const handleContextChange = useCallback(
    async (contextId: string) => {
      const nextContextId = String(contextId || "").trim();
      setSelectedContextId(nextContextId);
      const channelFromContext = inferChannelFromContextId(nextContextId);
      if (channelFromContext) {
        setSelectedChannel(channelFromContext);
      }
      if (!selectedAgentId || !nextContextId) return;
      await Promise.all([
        refreshChannelHistory(selectedAgentId, nextContextId),
        refreshContextMessages(selectedAgentId, nextContextId),
      ]);
    },
    [refreshChannelHistory, refreshContextMessages, selectedAgentId],
  );

  const runTask = useCallback(
    async (taskId: string) => {
      try {
        await requestJson("/api/tui/tasks/run", {
          method: "POST",
          body: JSON.stringify({ taskId, reason: "dashboard_manual_trigger" }),
        });
        showToast(`task ${taskId} 已触发`, "success");
        await Promise.all([refreshTasks(selectedAgentId), refreshLogs(selectedAgentId)]);
      } catch (error) {
        showToast(`task 执行失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshLogs, refreshTasks, requestJson, selectedAgentId, showToast],
  );

  const sendLocalMessage = useCallback(async () => {
    if (sending) return;
    const instructions = chatInput.trim();
    if (!instructions) return;
    if (!selectedAgentId) {
      showToast("当前无可用 agent", "error");
      return;
    }

    setSending(true);
    try {
      await requestJson(`/api/tui/contexts/${encodeURIComponent(LOCAL_UI_CONTEXT_ID)}/execute`, {
        method: "POST",
        body: JSON.stringify({ instructions }),
      });
      setChatInput("");
      await Promise.all([
        refreshLocalChat(selectedAgentId),
        refreshLogs(selectedAgentId),
        refreshOverview(selectedAgentId),
      ]);
      showToast("已发送到 local_ui", "success");
    } catch (error) {
      showToast(`发送失败: ${getErrorMessage(error)}`, "error");
    } finally {
      setSending(false);
    }
  }, [
    chatInput,
    refreshLocalChat,
    refreshLogs,
    refreshOverview,
    requestJson,
    selectedAgentId,
    sending,
    showToast,
  ]);

  const handleAgentChange = useCallback(
    (nextAgentId: string) => {
      setSelectedAgentId(nextAgentId);
      if (nextAgentId) {
        localStorage.setItem(AGENT_STORAGE_KEY, nextAgentId);
      } else {
        localStorage.removeItem(AGENT_STORAGE_KEY);
      }
      void refreshDashboard(nextAgentId);
    },
    [refreshDashboard],
  );

  useEffect(() => {
    void refreshDashboard();
    const timer = window.setInterval(() => {
      void refreshDashboard();
    }, 12000);
    return () => {
      window.clearInterval(timer);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [refreshDashboard]);

  return {
    agents,
    selectedAgentId,
    selectedAgent,
    overview,
    services,
    extensions,
    chatChannels,
    contexts,
    selectedChannel,
    selectedContextId,
    channelHistory,
    contextMessages,
    tasks,
    logs,
    prompt,
    localMessages,
    topbarStatus,
    topbarError,
    loading,
    sending,
    chatInput,
    toast,
    setChatInput,
    handleAgentChange,
    handleChannelChange,
    handleContextChange,
    refreshDashboard,
    refreshChatChannels,
    refreshExtensions,
    refreshContexts,
    refreshChannelHistory,
    refreshContextMessages,
    refreshPrompt,
    refreshLocalChat,
    controlService,
    controlExtension,
    runChatChannelAction,
    runTask,
    sendLocalMessage,
    constants: {
      LOCAL_UI_CONTEXT_ID,
    },
    uiHelpers: {
      formatTime,
      statusBadgeVariant,
    },
  };
}
