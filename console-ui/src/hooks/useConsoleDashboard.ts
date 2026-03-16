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
  UiConfigStatusItem,
  UiConfigStatusResponse,
  UiContextMessagesResponse,
  UiContextSummary,
  UiContextsResponse,
  UiContextTimelineMessage,
  UiLocalMessage,
  UiLocalMessagesResponse,
  UiLogItem,
  UiLogsResponse,
  UiModelResponse,
  UiModelPoolItem,
  UiModelPoolResponse,
  UiModelProviderItem,
  UiModelSummary,
  UiOverviewResponse,
  UiPromptResponse,
  UiExtensionRuntimeItem,
  UiExtensionsResponse,
  UiServiceItem,
  UiServicesResponse,
  UiTaskItem,
  UiTaskRunDetailResponse,
  UiTaskRunsResponse,
  UiTaskRunSummary,
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
   * 模型配置快照。
   */
  model: UiModelSummary | null;
  /**
   * 配置文件状态列表。
   */
  configStatus: UiConfigStatusItem[];
  /**
   * 模型池 provider 列表。
   */
  modelProviders: UiModelProviderItem[];
  /**
   * 模型池 model 列表。
   */
  modelPoolItems: UiModelPoolItem[];
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
  refreshPrompt: (agentId: string, contextId?: string) => Promise<void>;
  /**
   * 刷新模型信息。
   */
  refreshModel: (agentId: string) => Promise<void>;
  /**
   * 刷新模型池数据。
   */
  refreshModelPool: () => Promise<void>;
  /**
   * 刷新配置文件状态。
   */
  refreshConfigStatus: (agentId: string) => Promise<void>;
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
  runChatChannelAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => Promise<void>;
  /**
   * 更新 chat 渠道配置参数。
   */
  configureChatChannel: (channel: string, config: Record<string, unknown>) => Promise<void>;
  /**
   * 触发 task 运行。
   */
  runTask: (title: string) => Promise<void>;
  /**
   * 加载任务执行列表。
   */
  loadTaskRuns: (title: string, limit?: number) => Promise<UiTaskRunSummary[]>;
  /**
   * 加载任务执行详情。
   */
  loadTaskRunDetail: (title: string, timestamp: string) => Promise<UiTaskRunDetailResponse | null>;
  /**
   * 发送 local_ui 指令。
   */
  sendLocalMessage: () => Promise<void>;
  /**
   * 切换 active model。
   */
  switchModel: (primaryModelId: string) => Promise<void>;
  /**
   * 按指定 agent 切换 primary model。
   */
  switchModelForAgent: (agentId: string, primaryModelId: string) => Promise<void>;
  /**
   * 启动历史 agent（未运行记录）。
   */
  startAgentFromHistory: (agentId: string) => Promise<void>;
  /**
   * 新增或更新 provider。
   */
  upsertModelProvider: (input: {
    id: string;
    type: string;
    baseUrl?: string;
    apiKey?: string;
    clearBaseUrl?: boolean;
    clearApiKey?: boolean;
  }) => Promise<void>;
  /**
   * 删除 provider。
   */
  removeModelProvider: (providerId: string) => Promise<void>;
  /**
   * 测试 provider。
   */
  testModelProvider: (providerId: string) => Promise<void>;
  /**
   * 发现 provider 模型。
   */
  discoverModelProvider: (params: {
    providerId: string;
    autoAdd?: boolean;
    prefix?: string;
  }) => Promise<void>;
  /**
   * 新增或更新 model。
   */
  upsertModelPoolItem: (input: {
    id: string;
    providerId: string;
    name: string;
    temperature?: string;
    maxTokens?: string;
    topP?: string;
    frequencyPenalty?: string;
    presencePenalty?: string;
    anthropicVersion?: string;
    isPaused?: boolean;
  }) => Promise<void>;
  /**
   * 删除 model。
   */
  removeModelPoolItem: (modelId: string) => Promise<void>;
  /**
   * 设置 model pause 状态。
   */
  setModelPoolItemPaused: (modelId: string, isPaused: boolean) => Promise<void>;
  /**
   * 测试 model。
   */
  testModelPoolItem: (modelId: string, prompt?: string) => Promise<void>;
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
  const [selectedContextId, setSelectedContextId] = useState("");
  const [channelHistory, setChannelHistory] = useState<UiChatHistoryEvent[]>([]);
  const [contextMessages, setContextMessages] = useState<UiContextTimelineMessage[]>([]);
  const [tasks, setTasks] = useState<UiTaskItem[]>([]);
  const [logs, setLogs] = useState<UiLogItem[]>([]);
  const [model, setModel] = useState<UiModelSummary | null>(null);
  const [configStatus, setConfigStatus] = useState<UiConfigStatusItem[]>([]);
  const [modelProviders, setModelProviders] = useState<UiModelProviderItem[]>([]);
  const [modelPoolItems, setModelPoolItems] = useState<UiModelPoolItem[]>([]);
  const [prompt, setPrompt] = useState<UiPromptResponse | null>(null);
  const [localMessages, setLocalMessages] = useState<UiLocalMessage[]>([]);

  const [topbarStatus, setTopbarStatus] = useState("连接中...");
  const [topbarError, setTopbarError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const selectedContextIdRef = useRef("");
  const refreshDashboardRef = useRef<((preferredAgentId?: string) => Promise<void>) | null>(null);

  useEffect(() => {
    selectedContextIdRef.current = selectedContextId;
  }, [selectedContextId]);

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

  const refreshModel = useCallback(
    async (agentId: string) => {
      try {
        const endpoint = agentId
          ? `/api/ui/model?agent=${encodeURIComponent(agentId)}`
          : "/api/ui/model";
        const data = await requestJson<UiModelResponse>(endpoint, {}, agentId);
        setModel(data.model || null);
      } catch (error) {
        const message = getErrorMessage(error);
        // 关键点（中文）：异常场景降级为空，避免全局面板阻塞。
        if (/404|not found/i.test(message)) {
          setModel(null);
          return;
        }
        throw error;
      }
    },
    [requestJson],
  );

  const refreshConfigStatus = useCallback(
    async (agentId: string) => {
      const endpoint = agentId
        ? `/api/ui/config-status?agent=${encodeURIComponent(agentId)}`
        : "/api/ui/config-status";
      const data = await requestJson<UiConfigStatusResponse>(endpoint, {}, agentId);
      setConfigStatus(Array.isArray(data.items) ? data.items : []);
    },
    [requestJson],
  );

  const refreshModelPool = useCallback(async () => {
    const data = await requestJson<UiModelPoolResponse>("/api/ui/model/pool");
    setModelProviders(Array.isArray(data.providers) ? data.providers : []);
    setModelPoolItems(Array.isArray(data.models) ? data.models : []);
  }, [requestJson]);

  const refreshPrompt = useCallback(
    async (agentId: string, contextId?: string) => {
      if (!agentId) return;
      const resolvedContextId = String(contextId || LOCAL_UI_CONTEXT_ID).trim() || LOCAL_UI_CONTEXT_ID;
      try {
        const data = await requestJson<UiPromptResponse>(
          `/api/tui/system-prompt?contextId=${encodeURIComponent(resolvedContextId)}`,
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
          await refreshModel("");
          await refreshModelPool();
          await refreshConfigStatus("");
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
          refreshModel(nextAgentId),
          refreshModelPool(),
          refreshConfigStatus(nextAgentId),
          refreshLocalChat(nextAgentId),
        ]);

        const byCurrent =
          contextList.find((item) => item.contextId === selectedContextIdRef.current)?.contextId || "";
        const localUi = contextList.find((item) => item.contextId === LOCAL_UI_CONTEXT_ID)?.contextId || "";
        const fallback = contextList[0]?.contextId || "";
        const nextContext = byCurrent || localUi || fallback;
        setSelectedContextId(nextContext);

        if (nextContext) {
          await Promise.all([
            refreshChannelHistory(nextAgentId, nextContext),
            refreshContextMessages(nextAgentId, nextContext),
            refreshPrompt(nextAgentId, nextContext),
          ]);
        } else {
          setChannelHistory([]);
          setContextMessages([]);
          setPrompt(null);
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
      refreshConfigStatus,
      refreshModel,
      refreshModelPool,
      refreshOverview,
      refreshPrompt,
      refreshServices,
      refreshTasks,
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
    async (action: "test" | "reconnect" | "open" | "close", channel: string) => {
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

          const statusRow = chatChannels.find(
            (item) => String(item.channel || "").trim() === String(channel || "").trim(),
          );
          const linkState = String(statusRow?.linkState || "").trim().toLowerCase();
          const shouldAutoReconnect =
            Boolean(channel) &&
            Boolean(one?.success) &&
            linkState !== "connected";
          if (shouldAutoReconnect) {
            await requestJson("/api/services/command", {
              method: "POST",
              body: JSON.stringify({
                serviceName: "chat",
                command: "reconnect",
                payload: { channel },
              }),
            });
            showToast(`${channel} test 通过，已自动 reconnect`, "success");
          }
        } else if (action === "open" || action === "close") {
          showToast(`${channel || "chat"} ${action} 已执行（已写入 ship.json）`, "success");
        } else {
          showToast(`${channel || "chat"} ${action} 已执行`, "success");
        }

        await Promise.all([refreshChatChannels(selectedAgentId), refreshServices(selectedAgentId)]);
      } catch (error) {
        showToast(`chat ${action} 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [chatChannels, refreshChatChannels, refreshServices, requestJson, selectedAgentId, showToast],
  );

  const configureChatChannel = useCallback(
    async (channel: string, config: Record<string, unknown>) => {
      const normalizedChannel = String(channel || "").trim();
      if (!normalizedChannel) return;
      try {
        await requestJson("/api/services/command", {
          method: "POST",
          body: JSON.stringify({
            serviceName: "chat",
            command: "configure",
            payload: {
              channel: normalizedChannel,
              config,
              restart: true,
            },
          }),
        });
        showToast(`${normalizedChannel} 配置已保存并重载`, "success");
        await refreshDashboard(selectedAgentId);
      } catch (error) {
        showToast(`配置 ${normalizedChannel} 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshDashboard, requestJson, selectedAgentId, showToast],
  );

  const handleContextChange = useCallback(
    async (contextId: string) => {
      const nextContextId = String(contextId || "").trim();
      setSelectedContextId(nextContextId);
      if (!selectedAgentId || !nextContextId) return;
      await Promise.all([
        refreshChannelHistory(selectedAgentId, nextContextId),
        refreshContextMessages(selectedAgentId, nextContextId),
        refreshPrompt(selectedAgentId, nextContextId),
      ]);
    },
    [refreshChannelHistory, refreshContextMessages, refreshPrompt, selectedAgentId],
  );

  const runTask = useCallback(
    async (title: string) => {
      try {
        await requestJson("/api/tui/tasks/run", {
          method: "POST",
          body: JSON.stringify({ title, reason: "dashboard_manual_trigger" }),
        });
        showToast(`task ${title} 已触发`, "success");
        await Promise.all([refreshTasks(selectedAgentId), refreshLogs(selectedAgentId)]);
      } catch (error) {
        showToast(`task 执行失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshLogs, refreshTasks, requestJson, selectedAgentId, showToast],
  );

  const loadTaskRuns = useCallback(
    async (title: string, limit = 50): Promise<UiTaskRunSummary[]> => {
      const name = String(title || "").trim();
      if (!name) return [];
      try {
        const data = await requestJson<UiTaskRunsResponse>(
          `/api/tui/tasks/${encodeURIComponent(name)}/runs?limit=${encodeURIComponent(String(limit))}`,
          {},
          selectedAgentId,
        );
        return Array.isArray(data.runs) ? data.runs : [];
      } catch (error) {
        showToast(`加载 task runs 失败: ${getErrorMessage(error)}`, "error");
        return [];
      }
    },
    [requestJson, selectedAgentId, showToast],
  );

  const loadTaskRunDetail = useCallback(
    async (title: string, timestamp: string): Promise<UiTaskRunDetailResponse | null> => {
      const name = String(title || "").trim();
      const ts = String(timestamp || "").trim();
      if (!name || !ts) return null;
      try {
        const data = await requestJson<UiTaskRunDetailResponse>(
          `/api/tui/tasks/${encodeURIComponent(name)}/runs/${encodeURIComponent(ts)}`,
          {},
          selectedAgentId,
        );
        return data;
      } catch (error) {
        showToast(`加载 run 详情失败: ${getErrorMessage(error)}`, "error");
        return null;
      }
    },
    [requestJson, selectedAgentId, showToast],
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

  const switchModel = useCallback(
    async (primaryModelId: string) => {
      const next = String(primaryModelId || "").trim();
      if (!next) return;
      if (!selectedAgentId) {
        showToast("当前无可用 agent", "error");
        return;
      }
      try {
        const endpoint = `/api/ui/model/switch?agent=${encodeURIComponent(selectedAgentId)}`;
        await requestJson<{
          success?: boolean;
          restartRequired?: boolean;
          message?: string;
        }>(
          endpoint,
          {
            method: "POST",
            body: JSON.stringify({ primaryModelId: next }),
          },
          selectedAgentId,
        );
        await refreshModel(selectedAgentId);
        showToast("agent model.primary 已更新（需重启 agent 完整生效）", "success");
      } catch (error) {
        showToast(`model.primary 更新失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshModel, requestJson, selectedAgentId, showToast],
  );

  const switchModelForAgent = useCallback(
    async (agentId: string, primaryModelId: string) => {
      const targetAgentId = String(agentId || "").trim();
      const next = String(primaryModelId || "").trim();
      if (!targetAgentId || !next) return;
      try {
        const endpoint = `/api/ui/model/switch?agent=${encodeURIComponent(targetAgentId)}`;
        await requestJson<{
          success?: boolean;
          restartRequired?: boolean;
          message?: string;
        }>(
          endpoint,
          {
            method: "POST",
            body: JSON.stringify({ primaryModelId: next }),
          },
          targetAgentId,
        );
        await refreshDashboard(selectedAgentId || targetAgentId);
        showToast(`已更新 ${targetAgentId} 的 model.primary（需重启 agent 生效）`, "success");
      } catch (error) {
        showToast(`agent model.primary 更新失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshDashboard, requestJson, selectedAgentId, showToast],
  );

  const startAgentFromHistory = useCallback(
    async (agentId: string) => {
      const targetAgentId = String(agentId || "").trim();
      if (!targetAgentId) return;
      try {
        const data = await requestJson<{
          success?: boolean;
          started?: boolean;
          pid?: number;
        }>("/api/ui/agents/start", {
          method: "POST",
          body: JSON.stringify({ agentId: targetAgentId }),
        });
        await refreshDashboard(targetAgentId);
        if (data.started === true) {
          showToast(`agent 已启动（pid ${String(data.pid || "-")}）`, "success");
          return;
        }
        showToast("agent 已在运行", "info");
      } catch (error) {
        showToast(`启动 agent 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshDashboard, requestJson, showToast],
  );

  const upsertModelProvider = useCallback(
    async (input: {
      id: string;
      type: string;
      baseUrl?: string;
      apiKey?: string;
      clearBaseUrl?: boolean;
      clearApiKey?: boolean;
    }) => {
      try {
        await requestJson("/api/ui/model/provider/upsert", {
          method: "POST",
          body: JSON.stringify(input),
        });
        await Promise.all([refreshModelPool(), refreshModel(selectedAgentId)]);
        showToast(`provider ${input.id} 已保存`, "success");
      } catch (error) {
        showToast(`provider 保存失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshModel, refreshModelPool, requestJson, selectedAgentId, showToast],
  );

  const removeModelProvider = useCallback(
    async (providerId: string) => {
      try {
        await requestJson("/api/ui/model/provider/remove", {
          method: "POST",
          body: JSON.stringify({ providerId }),
        });
        await Promise.all([refreshModelPool(), refreshModel(selectedAgentId)]);
        showToast(`provider ${providerId} 已删除`, "success");
      } catch (error) {
        showToast(`provider 删除失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshModel, refreshModelPool, requestJson, selectedAgentId, showToast],
  );

  const testModelProvider = useCallback(
    async (providerId: string) => {
      try {
        const data = await requestJson<{
          success?: boolean;
          modelCount?: number;
        }>("/api/ui/model/provider/test", {
          method: "POST",
          body: JSON.stringify({ providerId }),
        });
        showToast(`provider ${providerId} 测试通过，发现 ${Number(data.modelCount || 0)} 个模型`, "success");
      } catch (error) {
        showToast(`provider 测试失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [requestJson, showToast],
  );

  const discoverModelProvider = useCallback(
    async (params: {
      providerId: string;
      autoAdd?: boolean;
      prefix?: string;
    }) => {
      try {
        const data = await requestJson<{
          success?: boolean;
          modelCount?: number;
          autoAdded?: unknown[];
        }>("/api/ui/model/provider/discover", {
          method: "POST",
          body: JSON.stringify(params),
        });
        await Promise.all([refreshModelPool(), refreshModel(selectedAgentId)]);
        const autoAddedCount = Array.isArray(data.autoAdded) ? data.autoAdded.length : 0;
        showToast(
          `discover 完成：${Number(data.modelCount || 0)} 个，自动添加 ${autoAddedCount} 个`,
          "success",
        );
      } catch (error) {
        showToast(`discover 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshModel, refreshModelPool, requestJson, selectedAgentId, showToast],
  );

  const upsertModelPoolItem = useCallback(
    async (input: {
      id: string;
      providerId: string;
      name: string;
      temperature?: string;
      maxTokens?: string;
      topP?: string;
      frequencyPenalty?: string;
      presencePenalty?: string;
      anthropicVersion?: string;
      isPaused?: boolean;
    }) => {
      try {
        await requestJson("/api/ui/model/model/upsert", {
          method: "POST",
          body: JSON.stringify({
            ...input,
            temperature: input.temperature?.trim() || undefined,
            maxTokens: input.maxTokens?.trim() || undefined,
            topP: input.topP?.trim() || undefined,
            frequencyPenalty: input.frequencyPenalty?.trim() || undefined,
            presencePenalty: input.presencePenalty?.trim() || undefined,
            anthropicVersion: input.anthropicVersion?.trim() || undefined,
          }),
        });
        await Promise.all([refreshModelPool(), refreshModel(selectedAgentId)]);
        showToast(`model ${input.id} 已保存`, "success");
      } catch (error) {
        showToast(`model 保存失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshModel, refreshModelPool, requestJson, selectedAgentId, showToast],
  );

  const removeModelPoolItem = useCallback(
    async (modelId: string) => {
      try {
        await requestJson("/api/ui/model/model/remove", {
          method: "POST",
          body: JSON.stringify({ modelId }),
        });
        await Promise.all([refreshModelPool(), refreshModel(selectedAgentId)]);
        showToast(`model ${modelId} 已删除`, "success");
      } catch (error) {
        showToast(`model 删除失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshModel, refreshModelPool, requestJson, selectedAgentId, showToast],
  );

  const setModelPoolItemPaused = useCallback(
    async (modelId: string, isPaused: boolean) => {
      try {
        await requestJson("/api/ui/model/model/pause", {
          method: "POST",
          body: JSON.stringify({ modelId, isPaused }),
        });
        await Promise.all([refreshModelPool(), refreshModel(selectedAgentId)]);
        showToast(`model ${modelId} 已${isPaused ? "暂停" : "恢复"}`, "success");
      } catch (error) {
        showToast(`model 状态更新失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshModel, refreshModelPool, requestJson, selectedAgentId, showToast],
  );

  const testModelPoolItem = useCallback(
    async (modelId: string, prompt?: string) => {
      try {
        await requestJson("/api/ui/model/model/test", {
          method: "POST",
          body: JSON.stringify({
            modelId,
            prompt: String(prompt || "").trim() || undefined,
          }),
        });
        showToast(`model ${modelId} 测试通过`, "success");
      } catch (error) {
        showToast(`model 测试失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [requestJson, showToast],
  );

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
    refreshDashboardRef.current = refreshDashboard;
  }, [refreshDashboard]);

  useEffect(() => {
    void refreshDashboardRef.current?.();
    const timer = window.setInterval(() => {
      void refreshDashboardRef.current?.();
    }, 12000);
    return () => {
      window.clearInterval(timer);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  return {
    agents,
    selectedAgentId,
    selectedAgent,
    overview,
    services,
    extensions,
    chatChannels,
    contexts,
    selectedContextId,
    channelHistory,
    contextMessages,
    tasks,
    logs,
    model,
    configStatus,
    modelProviders,
    modelPoolItems,
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
    handleContextChange,
    refreshDashboard,
    refreshChatChannels,
    refreshExtensions,
    refreshContexts,
    refreshChannelHistory,
    refreshContextMessages,
    refreshPrompt,
    refreshModel,
    refreshModelPool,
    refreshConfigStatus,
    refreshLocalChat,
    controlService,
    controlExtension,
    runChatChannelAction,
    configureChatChannel,
    runTask,
    loadTaskRuns,
    loadTaskRunDetail,
    sendLocalMessage,
    switchModel,
    switchModelForAgent,
    startAgentFromHistory,
    upsertModelProvider,
    removeModelProvider,
    testModelProvider,
    discoverModelProvider,
    upsertModelPoolItem,
    removeModelPoolItem,
    setModelPoolItemPaused,
    testModelPoolItem,
    constants: {
      LOCAL_UI_CONTEXT_ID,
    },
    uiHelpers: {
      formatTime,
      statusBadgeVariant,
    },
  };
}
