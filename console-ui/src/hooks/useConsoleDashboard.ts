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
  UiContextArchiveDetailResponse,
  UiContextArchivesResponse,
  UiContextArchiveSummary,
  UiChatDeleteResponse,
  UiContextClearResponse,
  UiCommandExecuteResponse,
  UiCommandExecuteResult,
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
  UiModelProviderDiscoverResult,
  UiModelProviderItem,
  UiModelSummary,
  UiChannelAccountItem,
  UiChannelAccountsResponse,
  UiChannelAccountProbeResult,
  UiOverviewResponse,
  UiPromptResponse,
  UiExtensionRuntimeItem,
  UiExtensionsResponse,
  UiServiceItem,
  UiServicesResponse,
  UiSkillListResponse,
  UiSkillCommandResponse,
  UiSkillFindPayload,
  UiSkillFindResult,
  UiSkillInstallPayload,
  UiSkillInstallResult,
  UiSkillLookupResult,
  UiSkillSummaryItem,
  UiTaskItem,
  UiTaskMutationResponse,
  UiTaskRunsClearResponse,
  UiTaskRunDeleteResponse,
  UiTaskRunDetailResponse,
  UiTaskRunsResponse,
  UiTaskRunSummary,
  UiTaskStatusValue,
  UiTasksResponse,
  UiEnvItem,
  UiEnvListResponse,
} from "../types/Dashboard";

const CONSOLEUI_CONTEXT_ID = "consoleui-chat-main";

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

function isNoRunningAgentError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return (
    message.includes("no running agent found") ||
    message.includes("start one via `city agent start` first") ||
    message.includes("no running agent selected")
  );
}

function isAgentUnavailableError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return (
    isNoRunningAgentError(message) ||
    message.includes("service unavailable") ||
    message.includes("selected agent runtime endpoint is unavailable") ||
    message.includes("503")
  );
}

function isChatServiceNotReadyError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return (
    (message.includes("service") && message.includes("chat") && message.includes("未启动")) ||
    (message.includes("service") && message.includes("chat") && message.includes("not started")) ||
    (message.includes("service") && message.includes("chat") && message.includes("not start")) ||
    (message.includes("chat") && message.includes("not running"))
  );
}

function isServiceNotRunningError(messageInput: string, serviceName: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  const name = String(serviceName || "").trim().toLowerCase();
  if (!name) return message.includes("is not running");
  return message.includes(`service \"${name}\" is not running`) || (
    message.includes("is not running") && message.includes(name)
  );
}

function isNotFoundError(messageInput: string): boolean {
  const message = String(messageInput || "").toLowerCase();
  return message.includes("404") || message.includes("not found");
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

/**
 * 异步等待工具。
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isConsoleUiContext(contextIdInput: string): boolean {
  const contextId = String(contextIdInput || "").trim().toLowerCase();
  if (!contextId) return false;
  return contextId.startsWith("consoleui-") || contextId === "local_ui";
}

function toHistoryEventsFromTimeline(
  contextId: string,
  timeline: UiContextTimelineMessage[],
): UiChatHistoryEvent[] {
  return timeline.map((item, index) => {
    const role = String(item.role || "").trim().toLowerCase();
    const tsRaw = item.ts;
    const tsNumber =
      typeof tsRaw === "number"
        ? tsRaw
        : Number.isFinite(Date.parse(String(tsRaw || "")))
          ? Date.parse(String(tsRaw || ""))
          : Date.now();
    return {
      id: String(item.id || `${contextId}:timeline:${index}`),
      contextId,
      channel: "consoleui",
      direction: role === "user" ? "inbound" : "outbound",
      ts: tsNumber,
      text: String(item.text || ""),
      ...(role === "user" ? { actorName: "user" } : { actorName: "agent" }),
    };
  });
}

export interface UseConsoleDashboardResult {
  /**
   * 当前 agent 列表。
   */
  agents: UiAgentOption[];
  /**
   * 当前 DC CLI 版本号（来自 console 网关）。
   */
  cityVersion: string;
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
   * skills 列表（来自 skill service 的 list）。
   */
  skills: UiSkillSummaryItem[];
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
   * compact archive 列表（按时间倒序）。
   */
  contextArchives: UiContextArchiveSummary[];
  /**
   * 当前选中的 archive id。
   */
  selectedArchiveId: string;
  /**
   * 当前选中 archive 的消息时间线。
   */
  contextArchiveMessages: UiContextTimelineMessage[];
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
   * Channel Account 列表（全局）。
   */
  channelAccounts: UiChannelAccountItem[];
  /**
   * Console 全局 env 列表。
   */
  globalEnvItems: UiEnvItem[];
  /**
   * 当前选中 agent 的私有 env 列表。
   */
  agentEnvItems: UiEnvItem[];
  /**
   * system prompt 数据。
   */
  prompt: UiPromptResponse | null;
  /**
   * consoleui channel 消息列表。
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
   * 是否正在发送 consoleui channel 消息。
   */
  sending: boolean;
  /**
   * 是否正在清理 context messages。
   */
  clearingContextMessages: boolean;
  /**
   * 是否正在清理 chat history。
   */
  clearingChatHistory: boolean;
  /**
   * 正在删除的 context id（空字符串表示无删除任务）。
   */
  deletingContextId: string;
  /**
   * consoleui channel 输入框内容。
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
  refreshExtensions: () => Promise<void>;
  /**
   * 刷新 skills 列表。
   */
  refreshSkills: (agentId: string) => Promise<void>;
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
   * 刷新 compact archive 列表。
   */
  refreshContextArchives: (agentId: string, contextId: string) => Promise<UiContextArchiveSummary[]>;
  /**
   * 加载 archive 详情。
   */
  loadContextArchiveMessages: (
    agentId: string,
    contextId: string,
    archiveId: string,
  ) => Promise<void>;
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
   * 刷新 Console 全局 env。
   */
  refreshGlobalEnv: () => Promise<void>;
  /**
   * 刷新当前 agent 私有 env。
   */
  refreshAgentEnv: () => Promise<void>;
  /**
   * 刷新配置文件状态。
   */
  refreshConfigStatus: (agentId: string) => Promise<void>;
  /**
   * 刷新 consoleui channel 消息。
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
   * 测试 extension 可用性（status）。
   */
  testExtension: (extensionName: string) => Promise<void>;
  /**
   * 执行 chat 渠道动作。
   */
  runChatChannelAction: (action: "test" | "reconnect" | "open" | "close", channel: string) => Promise<void>;
  /**
   * 更新 chat 渠道配置参数。
   */
  configureChatChannel: (channel: string, config: Record<string, unknown>) => Promise<void>;
  /**
   * 查找缺失 skill。
   */
  runSkillFind: (query: string) => Promise<UiSkillFindResult | null>;
  /**
   * 安装 skill。
   */
  runSkillInstall: (input: UiSkillInstallPayload) => Promise<UiSkillInstallResult | null>;
  /**
   * 读取 skill 内容（运行时注入）。
   */
  runSkillLookup: (name: string) => Promise<UiSkillLookupResult | null>;
  /**
   * 触发 task 运行。
   */
  runTask: (title: string) => Promise<void>;
  /**
   * 更新任务状态（enabled|paused|disabled）。
   */
  setTaskStatus: (title: string, status: UiTaskStatusValue) => Promise<boolean>;
  /**
   * 删除任务定义。
   */
  deleteTask: (title: string) => Promise<boolean>;
  /**
   * 加载任务执行列表。
   */
  loadTaskRuns: (title: string, limit?: number) => Promise<UiTaskRunSummary[]>;
  /**
   * 删除单条 run 记录目录。
   */
  deleteTaskRun: (title: string, timestamp: string) => Promise<boolean>;
  /**
   * 一键清理指定任务的全部 run 记录（运行中记录会自动跳过）。
   */
  clearTaskRuns: (title: string) => Promise<boolean>;
  /**
   * 加载任务执行详情。
   */
  loadTaskRunDetail: (title: string, timestamp: string) => Promise<UiTaskRunDetailResponse | null>;
  /**
   * 发送 consoleui channel 指令。
   */
  sendConsoleUiMessage: () => Promise<void>;
  /**
   * 清理指定 context 的消息历史（messages.jsonl）。
   */
  clearContextMessages: (contextId: string) => Promise<void>;
  /**
   * 清理指定 context 的 chat history（history.jsonl）。
   */
  clearChatHistory: (contextId: string) => Promise<void>;
  /**
   * 完整删除指定 context（包含映射、chat 审计与 context 目录）。
   */
  deleteChatContext: (contextId: string) => Promise<boolean>;
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
   * 重启指定 agent（运行前检查 context/task 执行状态）。
   */
  restartAgentFromHistory: (agentId: string) => Promise<void>;
  /**
   * 停止指定 agent（运行前检查 context/task 执行状态）。
   */
  stopAgentFromHistory: (agentId: string) => Promise<void>;
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
  }) => Promise<UiModelProviderDiscoverResult | null>;
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
   * 新增/更新 channel account。
   */
  upsertChannelAccount: (input: {
    id: string;
    channel: string;
    name: string;
    identity?: string;
    owner?: string;
    creator?: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
    authId?: string;
    clearBotToken?: boolean;
    clearAppId?: boolean;
    clearAppSecret?: boolean;
  }) => Promise<void>;
  /**
   * 探测 bot 凭据并自动获取 bot 信息。
   */
  probeChannelAccount: (input: {
    channel: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
  }) => Promise<UiChannelAccountProbeResult | null>;
  /**
   * 删除 channel account。
   */
  removeChannelAccount: (id: string) => Promise<void>;
  /**
   * 新增/更新 Console 全局 env。
   */
  upsertGlobalEnv: (input: {
    key: string;
    value: string;
  }) => Promise<void>;
  /**
   * 删除 Console 全局 env。
   */
  removeGlobalEnv: (key: string) => Promise<void>;
  /**
   * 新增/更新当前 agent 私有 env。
   */
  upsertAgentEnv: (input: {
    agentId: string;
    key: string;
    value: string;
  }) => Promise<void>;
  /**
   * 删除当前 agent 私有 env。
   */
  removeAgentEnv: (agentId: string, key: string) => Promise<void>;
  /**
   * 执行 agent 项目目录下的 shell command。
   */
  executeAgentCommand: (input: {
    command: string;
    timeoutMs?: number;
    agentId?: string;
  }) => Promise<UiCommandExecuteResult>;
  /**
   * 提供常用常量。
   */
  constants: {
    CONSOLEUI_CONTEXT_ID: string;
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
  const [cityVersion, setCityVersion] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const [overview, setOverview] = useState<UiOverviewResponse | null>(null);
  const [services, setServices] = useState<UiServiceItem[]>([]);
  const [skills, setSkills] = useState<UiSkillSummaryItem[]>([]);
  const [extensions, setExtensions] = useState<UiExtensionRuntimeItem[]>([]);
  const [chatChannels, setChatChannels] = useState<UiChatChannelStatus[]>([]);
  const [contexts, setContexts] = useState<UiContextSummary[]>([]);
  const [selectedContextId, setSelectedContextId] = useState("");
  const [channelHistory, setChannelHistory] = useState<UiChatHistoryEvent[]>([]);
  const [contextMessages, setContextMessages] = useState<UiContextTimelineMessage[]>([]);
  const [contextArchives, setContextArchives] = useState<UiContextArchiveSummary[]>([]);
  const [selectedArchiveId, setSelectedArchiveId] = useState("");
  const [contextArchiveMessages, setContextArchiveMessages] = useState<UiContextTimelineMessage[]>([]);
  const [tasks, setTasks] = useState<UiTaskItem[]>([]);
  const [logs, setLogs] = useState<UiLogItem[]>([]);
  const [model, setModel] = useState<UiModelSummary | null>(null);
  const [configStatus, setConfigStatus] = useState<UiConfigStatusItem[]>([]);
  const [modelProviders, setModelProviders] = useState<UiModelProviderItem[]>([]);
  const [modelPoolItems, setModelPoolItems] = useState<UiModelPoolItem[]>([]);
  const [channelAccounts, setChannelAccounts] = useState<UiChannelAccountItem[]>([]);
  const [globalEnvItems, setGlobalEnvItems] = useState<UiEnvItem[]>([]);
  const [agentEnvItems, setAgentEnvItems] = useState<UiEnvItem[]>([]);
  const [prompt, setPrompt] = useState<UiPromptResponse | null>(null);
  const [localMessages, setLocalMessages] = useState<UiLocalMessage[]>([]);

  const [topbarStatus, setTopbarStatus] = useState("连接中...");
  const [topbarError, setTopbarError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [clearingContextMessages, setClearingContextMessages] = useState(false);
  const [clearingChatHistory, setClearingChatHistory] = useState(false);
  const [deletingContextId, setDeletingContextId] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const selectedContextIdRef = useRef("");
  const selectedArchiveIdRef = useRef("");
  const refreshDashboardRef = useRef<((preferredAgentId?: string) => Promise<void>) | null>(null);
  const archiveApiStateRef = useRef<"unknown" | "supported" | "unsupported">("unknown");

  useEffect(() => {
    selectedContextIdRef.current = selectedContextId;
  }, [selectedContextId]);

  useEffect(() => {
    selectedArchiveIdRef.current = selectedArchiveId;
  }, [selectedArchiveId]);

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
    setSkills([]);
    // 关键点（中文）：extensions 作为全局页信息，保留上次快照，避免无 agent 时整块消失。
    setChatChannels([]);
    setContexts([]);
    setSelectedContextId("");
    setChannelHistory([]);
    setContextMessages([]);
    setContextArchives([]);
    setSelectedArchiveId("");
    setContextArchiveMessages([]);
    setTasks([]);
    setLogs([]);
    setPrompt(null);
    setLocalMessages([]);
  }, []);

  const refreshAgents = useCallback(
    async (preferredAgentId?: string): Promise<{ nextAgentId: string; list: UiAgentOption[] }> => {
      const preferred = String(preferredAgentId || selectedAgentId || "").trim();
      const endpoint = preferred
        ? `/api/ui/agents?agent=${encodeURIComponent(preferred)}`
        : "/api/ui/agents";
      let data: UiAgentsResponse;
      try {
        data = await requestJson<UiAgentsResponse>(endpoint);
      } catch (error) {
        const message = getErrorMessage(error);
        // 关键点（中文）：无运行中 agent 属于正常空态，不应走错误提示。
        if (isNoRunningAgentError(message)) {
          setAgents([]);
          setSelectedAgentId("");
          return { nextAgentId: "", list: [] };
        }
        throw error;
      }

      const list = Array.isArray(data.agents) ? data.agents : [];
      const nextCityVersion = String(data.cityVersion || "").trim();
      if (nextCityVersion) setCityVersion(nextCityVersion);
      const preferredMatched = preferred ? list.find((item) => item.id === preferred)?.id || "" : "";
      // 关键点（中文）：仅接受显式选择（路由驱动），不再自动挑选“当前 agent”。
      const nextId = preferredMatched || "";
      setAgents(list);

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

  const refreshSkills = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      try {
        const data = await requestJson<UiSkillListResponse>("/api/services/command", {
          method: "POST",
          body: JSON.stringify({
            serviceName: "skill",
            command: "list",
            payload: {},
          }),
        }, agentId);
        const items = Array.isArray(data?.data?.skills) ? data.data.skills : [];
        setSkills(items);
      } catch (error) {
        const message = getErrorMessage(error);
        if (
          /404|not found|unknown action|unknown service/i.test(message) ||
          isAgentUnavailableError(message) ||
          isServiceNotRunningError(message, "skill")
        ) {
          setSkills([]);
          return;
        }
        throw error;
      }
    },
    [requestJson],
  );

  const runSkillServiceCommand = useCallback(
    async <TData,>(
      params: {
        agentId: string;
        command: string;
        payload?: unknown;
      },
    ): Promise<UiSkillCommandResponse<TData>> => {
      const targetAgentId = String(params.agentId || "").trim();
      if (!targetAgentId) throw new Error("当前无可用 agent");
      const command = String(params.command || "").trim();
      if (!command) throw new Error("skill command 不能为空");
      const payload = params.payload ?? {};

      const execute = async () => {
        return requestJson<UiSkillCommandResponse<TData>>(
          "/api/services/command",
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
      };

      try {
        return await execute();
      } catch (error) {
        const message = getErrorMessage(error);
        if (!isServiceNotRunningError(message, "skill")) {
          throw error;
        }
        await requestJson(
          "/api/services/control",
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
    },
    [requestJson],
  );

  /**
   * 等待 agent 运行态与核心服务就绪。
   *
   * 关键点（中文）
   * - 仅当 agent 已 running 且 services 接口返回全就绪时，才视为“启动完成”。
   * - 启动窗口中的短暂 503 不视为失败，继续轮询等待。
   */
  const waitAgentReady = useCallback(
    async (
      agentId: string,
      options?: {
        maxRetry?: number;
        intervalMs?: number;
      },
    ): Promise<{ running: boolean; servicesReady: boolean }> => {
      const targetAgentId = String(agentId || "").trim();
      if (!targetAgentId) return { running: false, servicesReady: false };
      const maxRetry = Number.isFinite(options?.maxRetry as number) ? Number(options?.maxRetry) : 36;
      const intervalMs = Number.isFinite(options?.intervalMs as number) ? Number(options?.intervalMs) : 500;
      let running = false;

      for (let index = 0; index < maxRetry; index += 1) {
        try {
          const agentsSnapshot = await requestJson<UiAgentsResponse>(
            `/api/ui/agents?agent=${encodeURIComponent(targetAgentId)}`,
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
          const servicesData = await requestJson<UiServicesResponse>("/api/tui/services", {}, targetAgentId);
          const serviceList = Array.isArray(servicesData.services) ? servicesData.services : [];
          if (serviceList.length === 0) {
            await wait(intervalMs);
            continue;
          }
          const allReady = serviceList.every((item) => {
            const state = String(item.state || item.status || "").trim().toLowerCase();
            return ["running", "ok", "active", "enabled", "success", "idle"].includes(state);
          });
          if (!allReady) {
            await wait(intervalMs);
            continue;
          }

          const hasChatService = serviceList.some((item) => {
            const name = String(item.name || item.service || "").trim().toLowerCase();
            return name === "chat";
          });
          if (!hasChatService) return { running: true, servicesReady: true };

          try {
            await requestJson<UiChatStatusResponse>(
              "/api/services/command",
              {
                method: "POST",
                body: JSON.stringify({
                  serviceName: "chat",
                  command: "status",
                  payload: {},
                }),
              },
              targetAgentId,
            );
            return { running: true, servicesReady: true };
          } catch (chatError) {
            const chatMessage = getErrorMessage(chatError);
            if (/404|not found|unknown action|unknown service/i.test(chatMessage)) {
              // 老 runtime 无 chat.status，按服务就绪降级放行。
              return { running: true, servicesReady: true };
            }
            if (isChatServiceNotReadyError(chatMessage) || isAgentUnavailableError(chatMessage)) {
              await wait(intervalMs);
              continue;
            }
            throw chatError;
          }
        } catch (error) {
          const message = getErrorMessage(error);
          if (!isAgentUnavailableError(message)) {
            // 非启动窗口类错误，保持等待但不吞掉状态。
          }
        }

        await wait(intervalMs);
      }

      return { running, servicesReady: false };
    },
    [requestJson],
  );

  const refreshExtensions = useCallback(
    async () => {
      const data = await requestJson<UiExtensionsResponse>("/api/ui/extensions");
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
        const normalizedChannels = [
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
        setChatChannels(normalizedChannels);
        return normalizedChannels;
      } catch (error) {
        const message = getErrorMessage(error);
        // 关键点（中文）：兼容旧 runtime 不支持 chat.status 的场景。
        if (/404|not found|unknown action|unknown service/i.test(message)) {
          const fallbackChannels: UiChatChannelStatus[] = [
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
          setChatChannels(fallbackChannels);
          return fallbackChannels;
        }
        // 关键点（中文）：启动窗口内 chat 服务未就绪时降级为空，避免误报失败。
        if (isChatServiceNotReadyError(message) || isAgentUnavailableError(message)) {
          const fallbackChannels: UiChatChannelStatus[] = [
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
          setChatChannels(fallbackChannels);
          return fallbackChannels;
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
      const hasConsoleUiContext = list.some(
        (item) => String(item.contextId || "").trim() === CONSOLEUI_CONTEXT_ID,
      );
      const nextList = hasConsoleUiContext
        ? list
        : [
            {
              contextId: CONSOLEUI_CONTEXT_ID,
              channel: "consoleui",
              messageCount: 0,
              updatedAt: Date.now(),
              lastRole: "system",
              lastText: "consoleui channel",
            },
            ...list,
          ];
      setContexts(nextList);
      return nextList;
    },
    [requestJson],
  );

  const refreshChannelHistory = useCallback(
    async (agentId: string, contextId: string) => {
      if (!agentId || !contextId) return;
      try {
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
        if (events.length > 0 || !isConsoleUiContext(contextId)) {
          setChannelHistory(events);
          return;
        }
      } catch (error) {
        if (!isConsoleUiContext(contextId)) {
          throw error;
        }
      }

      // 关键点（中文）：consoleui channel 没有平台级 chat.history 时，回退到 context timeline。
      const fallbackData = await requestJson<UiContextMessagesResponse>(
        `/api/tui/contexts/${encodeURIComponent(contextId)}/messages?limit=100`,
        {},
        agentId,
      );
      const timeline = Array.isArray(fallbackData.messages)
        ? fallbackData.messages
        : [];
      setChannelHistory(toHistoryEventsFromTimeline(contextId, timeline));
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

  const loadContextArchiveMessages = useCallback(
    async (agentId: string, contextId: string, archiveId: string) => {
      if (!agentId || !contextId || !archiveId) {
        setSelectedArchiveId("");
        setContextArchiveMessages([]);
        return;
      }
      if (archiveApiStateRef.current === "unsupported") {
        setSelectedArchiveId("");
        setContextArchiveMessages([]);
        return;
      }
      try {
        const data = await requestJson<UiContextArchiveDetailResponse>(
          `/api/tui/contexts/${encodeURIComponent(contextId)}/archives/${encodeURIComponent(archiveId)}`,
          {},
          agentId,
        );
        archiveApiStateRef.current = "supported";
        setSelectedArchiveId(archiveId);
        setContextArchiveMessages(Array.isArray(data.messages) ? data.messages : []);
      } catch (error) {
        const message = getErrorMessage(error);
        if (isNotFoundError(message)) {
          // 关键点（中文）：兼容旧 console 网关未实现 archive 接口，前端降级为空态。
          archiveApiStateRef.current = "unsupported";
          setSelectedArchiveId("");
          setContextArchiveMessages([]);
          return;
        }
        throw error;
      }
    },
    [requestJson],
  );

  const refreshContextArchives = useCallback(
    async (agentId: string, contextId: string): Promise<UiContextArchiveSummary[]> => {
      if (!agentId || !contextId) {
        setContextArchives([]);
        setSelectedArchiveId("");
        setContextArchiveMessages([]);
        return [];
      }
      if (archiveApiStateRef.current === "unsupported") {
        setContextArchives([]);
        setSelectedArchiveId("");
        setContextArchiveMessages([]);
        return [];
      }
      let archives: UiContextArchiveSummary[] = [];
      try {
        const data = await requestJson<UiContextArchivesResponse>(
          `/api/tui/contexts/${encodeURIComponent(contextId)}/archives?limit=80`,
          {},
          agentId,
        );
        archiveApiStateRef.current = "supported";
        archives = Array.isArray(data.archives) ? data.archives : [];
      } catch (error) {
        const message = getErrorMessage(error);
        if (!isNotFoundError(message)) {
          throw error;
        }
        // 关键点（中文）：404 代表后端暂不支持 archives，按“无归档”处理，不中断主流程。
        archiveApiStateRef.current = "unsupported";
        archives = [];
      }
      setContextArchives(archives);

      const currentArchiveId = String(selectedArchiveIdRef.current || "").trim();
      const firstArchiveId = String(archives[0]?.archiveId || "").trim();
      const nextArchiveId = archives.some(
        (item) => String(item.archiveId || "").trim() === currentArchiveId,
      )
        ? currentArchiveId
        : firstArchiveId;

      if (!nextArchiveId) {
        setSelectedArchiveId("");
        setContextArchiveMessages([]);
        return archives;
      }

      await loadContextArchiveMessages(agentId, contextId, nextArchiveId);
      return archives;
    },
    [loadContextArchiveMessages, requestJson],
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

  const refreshGlobalEnv = useCallback(async () => {
    const data = await requestJson<UiEnvListResponse>("/api/ui/env");
    setGlobalEnvItems(Array.isArray(data.items) ? data.items : []);
  }, [requestJson]);

  const refreshAgentEnv = useCallback(async () => {
    const data = await requestJson<UiEnvListResponse>("/api/ui/env?scope=agent");
    setAgentEnvItems(Array.isArray(data.items) ? data.items : []);
  }, [requestJson]);

  const refreshChannelAccounts = useCallback(async () => {
    const data = await requestJson<UiChannelAccountsResponse>("/api/ui/channel-accounts");
    setChannelAccounts(Array.isArray(data.items) ? data.items : []);
  }, [requestJson]);

  const refreshPrompt = useCallback(
    async (agentId: string, contextId?: string) => {
      if (!agentId) return;
      const resolvedContextId = String(contextId || CONSOLEUI_CONTEXT_ID).trim() || CONSOLEUI_CONTEXT_ID;
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
        `/api/tui/contexts/${encodeURIComponent(CONSOLEUI_CONTEXT_ID)}/messages?limit=80`,
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
          setSelectedAgentId("");
          clearPanelDataForNoAgent();
          // 关键点（中文）：无 agent 也要保留并刷新全局 model/pool/config 信息。
          await Promise.allSettled([
            refreshExtensions(),
            refreshModel(""),
            refreshModelPool(),
            refreshChannelAccounts(),
            refreshGlobalEnv(),
            refreshConfigStatus(""),
          ]);
          setAgentEnvItems([]);
          setTopbarError(false);
          setTopbarStatus("Console 在线");
          return;
        }

        const selected = list.find((item) => item.id === nextAgentId) || null;
        if (selected && selected.running !== true) {
          // 关键点（中文）：未启动 agent 仅渲染静态概览，避免请求 runtime 接口造成 503 噪音。
          clearPanelDataForNoAgent();
          await Promise.allSettled([
            refreshExtensions(),
            refreshModel(nextAgentId),
            refreshModelPool(),
            refreshChannelAccounts(),
            refreshGlobalEnv(),
            refreshAgentEnv(),
            refreshConfigStatus(nextAgentId),
          ]);
          setTopbarError(false);
          setTopbarStatus("Console 在线");
          return;
        }

        const [channels, contextList] = await Promise.all([
          refreshChatChannels(nextAgentId),
          refreshContexts(nextAgentId),
        ]);

        await Promise.all([
          refreshExtensions(),
          refreshOverview(nextAgentId),
          refreshServices(nextAgentId),
          refreshSkills(nextAgentId),
          refreshTasks(nextAgentId),
          refreshLogs(nextAgentId),
          refreshModel(nextAgentId),
          refreshModelPool(),
          refreshChannelAccounts(),
          refreshGlobalEnv(),
          refreshAgentEnv(),
          refreshConfigStatus(nextAgentId),
          refreshLocalChat(nextAgentId),
        ]);

        const byCurrent =
          contextList.find((item) => item.contextId === selectedContextIdRef.current)?.contextId || "";
        const consoleUi =
          contextList.find((item) => item.contextId === CONSOLEUI_CONTEXT_ID)?.contextId || "";
        const fallback = contextList[0]?.contextId || "";
        const nextContext = byCurrent || consoleUi || fallback;
        setSelectedContextId(nextContext);

        if (nextContext) {
          await Promise.all([
            refreshChannelHistory(nextAgentId, nextContext),
            refreshContextMessages(nextAgentId, nextContext),
            refreshContextArchives(nextAgentId, nextContext),
            refreshPrompt(nextAgentId, nextContext),
          ]);
        } else {
          setChannelHistory([]);
          setContextMessages([]);
          setContextArchives([]);
          setSelectedArchiveId("");
          setContextArchiveMessages([]);
          setPrompt(null);
        }

        setTopbarError(false);
        setTopbarStatus("Console 在线");
      } catch (error) {
        const message = getErrorMessage(error);
        if (isAgentUnavailableError(message)) {
          const targetHint = String(preferredAgentId || selectedAgentId || "").trim();
          if (targetHint) {
            try {
              const agentsSnapshot = await requestJson<UiAgentsResponse>(
                `/api/ui/agents?agent=${encodeURIComponent(targetHint)}`,
              );
              const list = Array.isArray(agentsSnapshot.agents) ? agentsSnapshot.agents : [];
              const target = list.find((item) => String(item.id || "") === targetHint);
              if (target?.running === true) {
                setAgents(list);
                setSelectedAgentId(targetHint);
                setTopbarError(false);
                return;
              }
            } catch {
              // ignore
            }
          }
          // 关键点（中文）：agent 不可用时直接退回空态，避免轮询持续打离线 agent。
          clearPanelDataForNoAgent();
          setSelectedAgentId("");
          // 关键点（中文）：离线自愈分支同样要保留并刷新全局 model/pool/config。
          await Promise.allSettled([
            refreshExtensions(),
            refreshModel(""),
            refreshModelPool(),
            refreshChannelAccounts(),
            refreshGlobalEnv(),
            refreshConfigStatus(""),
          ]);
          setAgentEnvItems([]);
          setTopbarError(false);
          setTopbarStatus("Console 在线");
          return;
        }
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
      refreshContextArchives,
      refreshContextMessages,
      refreshContexts,
      refreshExtensions,
      refreshLocalChat,
      refreshLogs,
      refreshConfigStatus,
      refreshChannelAccounts,
      refreshModel,
      refreshModelPool,
      refreshGlobalEnv,
      refreshAgentEnv,
      refreshOverview,
      refreshPrompt,
      refreshServices,
      refreshSkills,
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
        await Promise.all([refreshServices(selectedAgentId), refreshSkills(selectedAgentId)]);
      } catch (error) {
        showToast(`service 操作失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshServices, refreshSkills, requestJson, selectedAgentId, showToast],
  );

  const controlExtension = useCallback(
    async (extensionName: string, action: "start" | "stop" | "restart") => {
      try {
        await requestJson("/api/extensions/control", {
          method: "POST",
          body: JSON.stringify({ extensionName, action }),
        });
        showToast(`extension ${extensionName} ${action} 已执行`, "success");
        await refreshExtensions();
      } catch (error) {
        showToast(`extension 操作失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshExtensions, requestJson, showToast],
  );

  const testExtension = useCallback(
    async (extensionName: string) => {
      try {
        const result = await requestJson<{
          success?: boolean;
          message?: string;
          extension?: {
            state?: string;
          };
        }>("/api/extensions/control", {
          method: "POST",
          body: JSON.stringify({ extensionName, action: "status" }),
        });
        const state = String(result?.extension?.state || "").trim() || "unknown";
        showToast(`extension ${extensionName} test: ${state}`, result?.success ? "success" : "error");
        await refreshExtensions();
      } catch (error) {
        showToast(`extension test 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshExtensions, requestJson, showToast],
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

  const runSkillFind = useCallback(
    async (query: string): Promise<UiSkillFindResult | null> => {
      const normalizedQuery = String(query || "").trim();
      if (!normalizedQuery) {
        showToast("请输入要查找的 skill 关键词", "error");
        return null;
      }
      if (!selectedAgentId) {
        showToast("当前无可用 agent", "error");
        return null;
      }
      const payload: UiSkillFindPayload = {
        query: normalizedQuery,
      };
      try {
        const data = await runSkillServiceCommand<UiSkillFindResult>({
          agentId: selectedAgentId,
          command: "find",
          payload,
        });
        const result = data?.data || null;
        showToast(result?.message || `已执行 skill find: ${normalizedQuery}`, "success");
        await refreshSkills(selectedAgentId);
        return result;
      } catch (error) {
        showToast(`skill find 失败: ${getErrorMessage(error)}`, "error");
        return null;
      }
    },
    [refreshSkills, runSkillServiceCommand, selectedAgentId, showToast],
  );

  const runSkillInstall = useCallback(
    async (input: UiSkillInstallPayload): Promise<UiSkillInstallResult | null> => {
      const spec = String(input.spec || "").trim();
      if (!spec) {
        showToast("请输入要安装的 skill spec", "error");
        return null;
      }
      if (!selectedAgentId) {
        showToast("当前无可用 agent", "error");
        return null;
      }
      const payload: UiSkillInstallPayload = {
        spec,
        global: input.global !== false,
        yes: input.yes !== false,
        agent: String(input.agent || "claude-code").trim() || "claude-code",
      };
      try {
        const data = await runSkillServiceCommand<UiSkillInstallResult>({
          agentId: selectedAgentId,
          command: "install",
          payload,
        });
        const result = data?.data || null;
        showToast(result?.message || `skill 安装完成: ${spec}`, "success");
        await refreshSkills(selectedAgentId);
        return result;
      } catch (error) {
        showToast(`skill install 失败: ${getErrorMessage(error)}`, "error");
        return null;
      }
    },
    [refreshSkills, runSkillServiceCommand, selectedAgentId, showToast],
  );

  const runSkillLookup = useCallback(
    async (name: string): Promise<UiSkillLookupResult | null> => {
      const normalizedName = String(name || "").trim();
      if (!normalizedName) {
        showToast("请输入 skill 名称", "error");
        return null;
      }
      if (!selectedAgentId) {
        showToast("当前无可用 agent", "error");
        return null;
      }
      try {
        const data = await runSkillServiceCommand<UiSkillLookupResult>({
          agentId: selectedAgentId,
          command: "lookup",
          payload: {
            name: normalizedName,
          },
        });
        const result = data?.data || null;
        const targetName = String(result?.skill?.name || normalizedName).trim() || normalizedName;
        showToast(result?.message || `skill lookup 已执行: ${targetName}`, "success");
        return result;
      } catch (error) {
        showToast(`skill lookup 失败: ${getErrorMessage(error)}`, "error");
        return null;
      }
    },
    [runSkillServiceCommand, selectedAgentId, showToast],
  );

  const handleContextChange = useCallback(
    async (contextId: string) => {
      const nextContextId = String(contextId || "").trim();
      setSelectedContextId(nextContextId);
      if (!selectedAgentId || !nextContextId) return;
      await Promise.all([
        refreshChannelHistory(selectedAgentId, nextContextId),
        refreshContextMessages(selectedAgentId, nextContextId),
        refreshContextArchives(selectedAgentId, nextContextId),
        refreshPrompt(selectedAgentId, nextContextId),
      ]);
    },
    [
      refreshChannelHistory,
      refreshContextArchives,
      refreshContextMessages,
      refreshPrompt,
      selectedAgentId,
    ],
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

  const setTaskStatus = useCallback(
    async (title: string, status: UiTaskStatusValue): Promise<boolean> => {
      const normalizedTitle = String(title || "").trim();
      if (!normalizedTitle) {
        showToast("task title 不能为空", "error");
        return false;
      }
      try {
        const response = await requestJson<UiTaskMutationResponse>(
          `/api/tui/tasks/${encodeURIComponent(normalizedTitle)}/status`,
          {
            method: "POST",
            body: JSON.stringify({ status }),
          },
          selectedAgentId,
        );
        const nextStatus = String(response?.status || status).trim() || status;
        showToast(`task ${normalizedTitle} 状态已更新为 ${nextStatus}`, "success");
        await Promise.all([refreshTasks(selectedAgentId), refreshOverview(selectedAgentId)]);
        return true;
      } catch (error) {
        showToast(`task 状态更新失败: ${getErrorMessage(error)}`, "error");
        return false;
      }
    },
    [refreshOverview, refreshTasks, requestJson, selectedAgentId, showToast],
  );

  const deleteTask = useCallback(
    async (title: string): Promise<boolean> => {
      const normalizedTitle = String(title || "").trim();
      if (!normalizedTitle) {
        showToast("task title 不能为空", "error");
        return false;
      }
      try {
        await requestJson<UiTaskMutationResponse>(
          `/api/tui/tasks/${encodeURIComponent(normalizedTitle)}`,
          { method: "DELETE" },
          selectedAgentId,
        );
        showToast(`task ${normalizedTitle} 已删除`, "success");
        await Promise.all([
          refreshTasks(selectedAgentId),
          refreshOverview(selectedAgentId),
          refreshLogs(selectedAgentId),
        ]);
        return true;
      } catch (error) {
        showToast(`task 删除失败: ${getErrorMessage(error)}`, "error");
        return false;
      }
    },
    [refreshLogs, refreshOverview, refreshTasks, requestJson, selectedAgentId, showToast],
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

  const deleteTaskRun = useCallback(
    async (title: string, timestamp: string): Promise<boolean> => {
      const normalizedTitle = String(title || "").trim();
      const normalizedTimestamp = String(timestamp || "").trim();
      if (!normalizedTitle || !normalizedTimestamp) {
        showToast("task title 或 run timestamp 不能为空", "error");
        return false;
      }
      try {
        await requestJson<UiTaskRunDeleteResponse>(
          `/api/tui/tasks/${encodeURIComponent(normalizedTitle)}/runs/${encodeURIComponent(normalizedTimestamp)}`,
          { method: "DELETE" },
          selectedAgentId,
        );
        showToast(`run ${normalizedTimestamp} 已删除`, "success");
        await refreshLogs(selectedAgentId);
        return true;
      } catch (error) {
        showToast(`删除 run 记录失败: ${getErrorMessage(error)}`, "error");
        return false;
      }
    },
    [refreshLogs, requestJson, selectedAgentId, showToast],
  );

  const clearTaskRuns = useCallback(
    async (title: string): Promise<boolean> => {
      const normalizedTitle = String(title || "").trim();
      if (!normalizedTitle) {
        showToast("task title 不能为空", "error");
        return false;
      }
      try {
        const data = await requestJson<UiTaskRunsClearResponse>(
          `/api/tui/tasks/${encodeURIComponent(normalizedTitle)}/runs`,
          { method: "DELETE" },
          selectedAgentId,
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
          showToast(
            `已清理 ${deletedCount} 条 run，跳过 ${skippedCount} 条运行中记录`,
            "success",
          );
        } else {
          showToast(`已清理 ${deletedCount} 条 run 记录`, "success");
        }
        await refreshLogs(selectedAgentId);
        return true;
      } catch (error) {
        showToast(`清理 run 记录失败: ${getErrorMessage(error)}`, "error");
        return false;
      }
    },
    [refreshLogs, requestJson, selectedAgentId, showToast],
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

  const sendConsoleUiMessage = useCallback(async () => {
    if (sending) return;
    const instructions = chatInput.trim();
    if (!instructions) return;
    if (!selectedAgentId) {
      showToast("当前无可用 agent", "error");
      return;
    }

    setSending(true);
    try {
      const currentContextId = String(selectedContextIdRef.current || "").trim();
      const targetContextId =
        currentContextId.startsWith("consoleui-") || currentContextId === "local_ui"
          ? currentContextId
          : CONSOLEUI_CONTEXT_ID;
      await requestJson(`/api/tui/contexts/${encodeURIComponent(targetContextId)}/execute`, {
        method: "POST",
        body: JSON.stringify({ instructions }),
      });
      setChatInput("");
      await Promise.all([
        refreshLocalChat(selectedAgentId),
        refreshChannelHistory(selectedAgentId, targetContextId),
        refreshContextMessages(selectedAgentId, targetContextId),
        refreshContextArchives(selectedAgentId, targetContextId),
        refreshPrompt(selectedAgentId, targetContextId),
        refreshLogs(selectedAgentId),
        refreshOverview(selectedAgentId),
      ]);
      showToast("已发送到 consoleui channel", "success");
    } catch (error) {
      showToast(`发送失败: ${getErrorMessage(error)}`, "error");
    } finally {
      setSending(false);
    }
  }, [
    chatInput,
    refreshLocalChat,
    refreshChannelHistory,
    refreshContextArchives,
    refreshContextMessages,
    refreshLogs,
    refreshOverview,
    refreshPrompt,
    requestJson,
    selectedAgentId,
    sending,
    showToast,
  ]);

  const clearContextMessages = useCallback(
    async (contextIdInput: string) => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return;
      if (!selectedAgentId) {
        showToast("当前无可用 agent", "error");
        return;
      }
      if (clearingContextMessages) return;

      setClearingContextMessages(true);
      try {
        await requestJson<UiContextClearResponse>(
          `/api/tui/contexts/${encodeURIComponent(contextId)}/messages`,
          { method: "DELETE" },
          selectedAgentId,
        );
        await Promise.all([
          refreshContexts(selectedAgentId),
          refreshChannelHistory(selectedAgentId, contextId),
          refreshContextMessages(selectedAgentId, contextId),
          refreshContextArchives(selectedAgentId, contextId),
          refreshPrompt(selectedAgentId, contextId),
          refreshOverview(selectedAgentId),
          refreshLogs(selectedAgentId),
        ]);
        showToast("context messages 已清理", "success");
      } catch (error) {
        showToast(`清理 context messages 失败: ${getErrorMessage(error)}`, "error");
      } finally {
        setClearingContextMessages(false);
      }
    },
    [
      clearingContextMessages,
      refreshChannelHistory,
      refreshContextArchives,
      refreshContextMessages,
      refreshContexts,
      refreshLogs,
      refreshOverview,
      refreshPrompt,
      requestJson,
      selectedAgentId,
      showToast,
    ],
  );

  const clearChatHistory = useCallback(
    async (contextIdInput: string) => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return;
      if (isConsoleUiContext(contextId)) {
        await clearContextMessages(contextId);
        return;
      }
      if (!selectedAgentId) {
        showToast("当前无可用 agent", "error");
        return;
      }
      if (clearingChatHistory) return;

      setClearingChatHistory(true);
      try {
        await requestJson<UiContextClearResponse>(
          `/api/tui/contexts/${encodeURIComponent(contextId)}/chat-history`,
          { method: "DELETE" },
          selectedAgentId,
        );
        await Promise.all([
          refreshChannelHistory(selectedAgentId, contextId),
          refreshLogs(selectedAgentId),
        ]);
        showToast("chat history 已清理", "success");
      } catch (error) {
        showToast(`清理 chat history 失败: ${getErrorMessage(error)}`, "error");
      } finally {
        setClearingChatHistory(false);
      }
    },
    [
      clearContextMessages,
      clearingChatHistory,
      refreshChannelHistory,
      refreshLogs,
      requestJson,
      selectedAgentId,
      showToast,
    ],
  );

  const deleteChatContext = useCallback(
    async (contextIdInput: string): Promise<boolean> => {
      const contextId = String(contextIdInput || "").trim();
      if (!contextId) return false;
      if (!selectedAgentId) {
        showToast("当前无可用 agent", "error");
        return false;
      }
      if (deletingContextId) return false;

      setDeletingContextId(contextId);
      try {
        const data = await requestJson<UiChatDeleteResponse>(
          "/api/services/command",
          {
            method: "POST",
            body: JSON.stringify({
              serviceName: "chat",
              command: "delete",
              payload: {
                contextId,
              },
            }),
          },
          selectedAgentId,
        );
        const deleted = data?.data?.deleted === true;

        const contextList = await refreshContexts(selectedAgentId);
        const currentSelectedContextId = String(selectedContextIdRef.current || "").trim();
        const preservedCurrent =
          contextList.find((item) => item.contextId === currentSelectedContextId)?.contextId || "";
        const consoleUiContext =
          contextList.find((item) => item.contextId === CONSOLEUI_CONTEXT_ID)?.contextId || "";
        const fallbackContext = contextList[0]?.contextId || "";
        const nextContextId = preservedCurrent || consoleUiContext || fallbackContext;

        // 关键点（中文）：删除后立即重建当前上下文视图，避免 UI 停留在已删除 context。
        if (nextContextId) {
          setSelectedContextId(nextContextId);
          await Promise.all([
            refreshChannelHistory(selectedAgentId, nextContextId),
            refreshContextMessages(selectedAgentId, nextContextId),
            refreshContextArchives(selectedAgentId, nextContextId),
            refreshPrompt(selectedAgentId, nextContextId),
          ]);
        } else {
          setSelectedContextId("");
          setChannelHistory([]);
          setContextMessages([]);
          setContextArchives([]);
          setSelectedArchiveId("");
          setContextArchiveMessages([]);
          setPrompt(null);
        }

        await Promise.all([
          refreshChatChannels(selectedAgentId),
          refreshOverview(selectedAgentId),
          refreshLogs(selectedAgentId),
          refreshLocalChat(selectedAgentId),
        ]);

        showToast(
          deleted ? `已删除 context: ${contextId}` : `context 不存在，已同步状态: ${contextId}`,
          "success",
        );
        return deleted;
      } catch (error) {
        showToast(`删除 context 失败: ${getErrorMessage(error)}`, "error");
        return false;
      } finally {
        setDeletingContextId("");
      }
    },
    [
      deletingContextId,
      refreshChannelHistory,
      refreshChatChannels,
      refreshContextArchives,
      refreshContextMessages,
      refreshContexts,
      refreshLocalChat,
      refreshLogs,
      refreshOverview,
      refreshPrompt,
      requestJson,
      selectedAgentId,
      showToast,
    ],
  );

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

        const readyState = await waitAgentReady(targetAgentId, {
          maxRetry: 120,
          intervalMs: 500,
        });

        if (readyState.running && readyState.servicesReady) {
          await refreshDashboard(targetAgentId);
          if (data.started === true) {
            showToast(`agent 已启动（pid ${String(data.pid || "-")}）`, "success");
          } else {
            showToast("agent 已在运行", "info");
          }
          return;
        }

        showToast("agent 启动超时：服务未全部就绪", "error");
      } catch (error) {
        showToast(`启动 agent 失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshDashboard, requestJson, showToast, waitAgentReady],
  );

  const restartAgentFromHistory = useCallback(
    async (agentId: string) => {
      const targetAgentId = String(agentId || "").trim();
      if (!targetAgentId) return;
      try {
        await requestJson<{
          success?: boolean;
          restarted?: boolean;
          pid?: number;
          activeContexts?: string[];
          activeTasks?: string[];
        }>("/api/ui/agents/restart", {
          method: "POST",
          body: JSON.stringify({ agentId: targetAgentId }),
        });

        const readyState = await waitAgentReady(targetAgentId, {
          maxRetry: 120,
          intervalMs: 500,
        });

        if (readyState.running && readyState.servicesReady) {
          await refreshDashboard(targetAgentId);
          showToast("agent 已重启", "success");
          return;
        }

        showToast("agent 重启超时：服务未全部就绪", "error");
      } catch (error) {
        const message = getErrorMessage(error);
        if (/not found/i.test(message)) {
          showToast("当前 Console UI 进程版本过旧，请先重启 `city console ui` 后再重启 agent", "error");
          return;
        }
        showToast(`重启 agent 失败: ${message}`, "error");
      }
    },
    [refreshDashboard, requestJson, showToast, waitAgentReady],
  );

  const stopAgentFromHistory = useCallback(
    async (agentId: string) => {
      const targetAgentId = String(agentId || "").trim();
      if (!targetAgentId) return;
      try {
        await requestJson<{
          success?: boolean;
          stopped?: boolean;
          pid?: number;
          activeContexts?: string[];
          activeTasks?: string[];
        }>("/api/ui/agents/stop", {
          method: "POST",
          body: JSON.stringify({ agentId: targetAgentId }),
        });

        const maxRetry = 20;
        const intervalMs = 400;
        let stopped = false;
        for (let index = 0; index < maxRetry; index += 1) {
          const agentsSnapshot = await requestJson<UiAgentsResponse>(
            `/api/ui/agents?agent=${encodeURIComponent(targetAgentId)}`,
          );
          const list = Array.isArray(agentsSnapshot.agents) ? agentsSnapshot.agents : [];
          const target = list.find((item) => String(item.id || "") === targetAgentId);
          if (!target || target.running !== true) {
            stopped = true;
            break;
          }
          await wait(intervalMs);
        }

        await refreshDashboard(selectedAgentId || targetAgentId);
        if (stopped) {
          showToast("agent 已停止", "success");
          return;
        }
        showToast("agent 停止中，请稍后刷新", "info");
      } catch (error) {
        const message = getErrorMessage(error);
        if (/not found/i.test(message)) {
          showToast("当前 Console UI 进程版本过旧，请先重启 `city console ui` 后再停止 agent", "error");
          return;
        }
        showToast(`停止 agent 失败: ${message}`, "error");
      }
    },
    [refreshDashboard, requestJson, selectedAgentId, showToast],
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
        const data = await requestJson<UiModelProviderDiscoverResult & { success?: boolean }>(
          "/api/ui/model/provider/discover",
          {
          method: "POST",
          body: JSON.stringify(params),
          },
        );
        const payload: UiModelProviderDiscoverResult = {
          providerId: String(data.providerId || params.providerId || "").trim(),
          discoveredModels: Array.isArray(data.discoveredModels) ? data.discoveredModels : [],
          modelCount: Number(data.modelCount || 0),
          autoAdded: Array.isArray(data.autoAdded) ? data.autoAdded : [],
        };
        if (params.autoAdd === true) {
          await Promise.all([refreshModelPool(), refreshModel(selectedAgentId)]);
          showToast(
            `discover 完成：${payload.modelCount} 个，自动添加 ${payload.autoAdded.length} 个`,
            "success",
          );
        } else {
          showToast(`discover 完成：发现 ${payload.modelCount} 个模型，请选择后添加`, "success");
        }
        return payload;
      } catch (error) {
        showToast(`discover 失败: ${getErrorMessage(error)}`, "error");
        return null;
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

  const upsertChannelAccount = useCallback(
    async (input: {
      id: string;
      channel: string;
      name: string;
      identity?: string;
      owner?: string;
      creator?: string;
      botToken?: string;
      appId?: string;
      appSecret?: string;
      domain?: string;
      sandbox?: boolean;
      authId?: string;
      clearBotToken?: boolean;
      clearAppId?: boolean;
      clearAppSecret?: boolean;
    }) => {
      try {
        await requestJson("/api/ui/channel-accounts/upsert", {
          method: "POST",
          body: JSON.stringify(input),
        });
        await Promise.all([refreshChannelAccounts(), refreshChatChannels(selectedAgentId)]);
        showToast(`channel account ${input.id} 已确认`, "success");
      } catch (error) {
        showToast(`channel account 确认失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshChannelAccounts, refreshChatChannels, requestJson, selectedAgentId, showToast],
  );

  const probeChannelAccount = useCallback(
    async (input: {
      channel: string;
      botToken?: string;
      appId?: string;
      appSecret?: string;
      domain?: string;
      sandbox?: boolean;
    }): Promise<UiChannelAccountProbeResult | null> => {
      try {
        const data = await requestJson<{
          success?: boolean;
          channel?: string;
          accountId?: string;
          name?: string;
          identity?: string;
          owner?: string;
          creator?: string;
          botUserId?: string;
          message?: string;
        }>("/api/ui/channel-accounts/probe", {
          method: "POST",
          body: JSON.stringify(input),
        });
        const payload: UiChannelAccountProbeResult = {
          channel: String(data.channel || input.channel || "").trim(),
          accountId: String(data.accountId || "").trim(),
          name: String(data.name || "").trim(),
          identity: String(data.identity || "").trim() || undefined,
          owner: String(data.owner || "").trim() || undefined,
          creator: String(data.creator || "").trim() || undefined,
          botUserId: String(data.botUserId || "").trim() || undefined,
          message: String(data.message || "").trim() || undefined,
        };
        if (!payload.accountId || !payload.name) {
          showToast("bot 信息探测成功，但返回数据不完整", "error");
          return null;
        }
        showToast(payload.message || "bot 信息探测成功", "success");
        return payload;
      } catch (error) {
        showToast(`bot 信息探测失败: ${getErrorMessage(error)}`, "error");
        return null;
      }
    },
    [requestJson, showToast],
  );

  const removeChannelAccount = useCallback(
    async (id: string) => {
      try {
        await requestJson("/api/ui/channel-accounts/remove", {
          method: "POST",
          body: JSON.stringify({ id }),
        });
        await Promise.all([refreshChannelAccounts(), refreshChatChannels(selectedAgentId)]);
        showToast(`channel account ${id} 已删除`, "success");
      } catch (error) {
        showToast(`channel account 删除失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshChannelAccounts, refreshChatChannels, requestJson, selectedAgentId, showToast],
  );

  const upsertGlobalEnv = useCallback(
    async (input: {
      key: string;
      value: string;
    }) => {
      try {
        await requestJson("/api/ui/env/upsert", {
          method: "POST",
          body: JSON.stringify({
            scope: "global",
            key: String(input.key || "").trim(),
            value: String(input.value ?? ""),
          }),
        });
        await refreshGlobalEnv();
        showToast(`env ${String(input.key || "").trim()} 已保存`, "success");
      } catch (error) {
        showToast(`env 保存失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshGlobalEnv, requestJson, showToast],
  );

  const removeGlobalEnv = useCallback(
    async (key: string) => {
      try {
        await requestJson("/api/ui/env/remove", {
          method: "POST",
          body: JSON.stringify({
            scope: "global",
            key: String(key || "").trim(),
          }),
        });
        await refreshGlobalEnv();
        showToast(`env ${String(key || "").trim()} 已删除`, "success");
      } catch (error) {
        showToast(`env 删除失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshGlobalEnv, requestJson, showToast],
  );

  const upsertAgentEnv = useCallback(
    async (input: {
      agentId: string;
      key: string;
      value: string;
    }) => {
      const agentId = String(input.agentId || "").trim();
      if (!agentId) {
        showToast("当前没有可写入的 agent", "error");
        return;
      }
      try {
        await requestJson("/api/ui/env/upsert", {
          method: "POST",
          body: JSON.stringify({
            scope: "agent",
            agentId,
            key: String(input.key || "").trim(),
            value: String(input.value ?? ""),
          }),
        });
        await refreshAgentEnv();
        showToast(`agent env ${String(input.key || "").trim()} 已保存`, "success");
      } catch (error) {
        showToast(`agent env 保存失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshAgentEnv, requestJson, showToast],
  );

  const removeAgentEnv = useCallback(
    async (agentIdInput: string, key: string) => {
      const agentId = String(agentIdInput || "").trim();
      if (!agentId) {
        showToast("当前没有可删除的 agent env", "error");
        return;
      }
      try {
        await requestJson("/api/ui/env/remove", {
          method: "POST",
          body: JSON.stringify({
            scope: "agent",
            agentId,
            key: String(key || "").trim(),
          }),
        });
        await refreshAgentEnv();
        showToast(`agent env ${String(key || "").trim()} 已删除`, "success");
      } catch (error) {
        showToast(`agent env 删除失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [refreshAgentEnv, requestJson, showToast],
  );

  const executeAgentCommand = useCallback(
    async (input: {
      command: string;
      timeoutMs?: number;
      agentId?: string;
    }): Promise<UiCommandExecuteResult> => {
      const command = String(input.command || "").trim();
      const targetAgentId = String(input.agentId || selectedAgentId || "").trim();
      if (!command) {
        throw new Error("command 不能为空");
      }
      if (!targetAgentId) {
        throw new Error("当前无可用 agent");
      }
      const response = await requestJson<UiCommandExecuteResponse>(
        "/api/ui/command/execute",
        {
          method: "POST",
          body: JSON.stringify({
            agentId: targetAgentId,
            command,
            timeoutMs: input.timeoutMs,
          }),
        },
        targetAgentId,
      );
      if (!response.result) {
        throw new Error("command 执行失败：缺少结果");
      }
      return response.result;
    },
    [requestJson, selectedAgentId],
  );

  const handleAgentChange = useCallback(
    (nextAgentId: string) => {
      setSelectedAgentId(nextAgentId);
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
    cityVersion,
    selectedAgentId,
    selectedAgent,
    overview,
    services,
    skills,
    extensions,
    chatChannels,
    contexts,
    selectedContextId,
    channelHistory,
    contextMessages,
    contextArchives,
    selectedArchiveId,
    contextArchiveMessages,
    tasks,
    logs,
    model,
    configStatus,
    modelProviders,
    modelPoolItems,
    channelAccounts,
    globalEnvItems,
    agentEnvItems,
    prompt,
    localMessages,
    topbarStatus,
    topbarError,
    loading,
    sending,
    clearingContextMessages,
    clearingChatHistory,
    deletingContextId,
    chatInput,
    toast,
    setChatInput,
    handleAgentChange,
    handleContextChange,
    refreshDashboard,
    refreshChatChannels,
    refreshExtensions,
    refreshSkills,
    refreshContexts,
    refreshChannelHistory,
    refreshContextMessages,
    refreshContextArchives,
    loadContextArchiveMessages,
    refreshPrompt,
    refreshModel,
    refreshModelPool,
    refreshGlobalEnv,
    refreshAgentEnv,
    refreshConfigStatus,
    refreshLocalChat,
    controlService,
    controlExtension,
    testExtension,
    runChatChannelAction,
    configureChatChannel,
    runSkillFind,
    runSkillInstall,
    runSkillLookup,
    runTask,
    setTaskStatus,
    deleteTask,
    loadTaskRuns,
    deleteTaskRun,
    clearTaskRuns,
    loadTaskRunDetail,
    sendConsoleUiMessage,
    clearContextMessages,
    clearChatHistory,
    deleteChatContext,
    switchModel,
    switchModelForAgent,
    startAgentFromHistory,
    restartAgentFromHistory,
    stopAgentFromHistory,
    upsertModelProvider,
    removeModelProvider,
    testModelProvider,
    discoverModelProvider,
    upsertModelPoolItem,
    removeModelPoolItem,
    setModelPoolItemPaused,
    testModelPoolItem,
    upsertChannelAccount,
    probeChannelAccount,
    removeChannelAccount,
    upsertGlobalEnv,
    removeGlobalEnv,
    upsertAgentEnv,
    removeAgentEnv,
    executeAgentCommand,
    constants: {
      CONSOLEUI_CONTEXT_ID,
    },
    uiHelpers: {
      formatTime,
      statusBadgeVariant,
    },
  };
}
