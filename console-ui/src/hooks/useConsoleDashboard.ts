/**
 * Console Dashboard 状态与行为管理。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestConsoleApiJson } from "../lib/dashboard-api";
import {
  queryAgentEnv,
  queryAgents,
  queryAuthorization,
  queryChannelAccounts,
  queryChannelHistory,
  queryChatChannels,
  queryConfigStatus,
  queryContextArchiveDetail,
  queryContextArchives,
  queryContextMessages,
  queryContexts,
  queryGlobalEnv,
  queryLocalMessages,
  queryLogs,
  queryModel,
  queryModelPool,
  queryOverview,
  queryPlugins,
  queryPrompt,
  queryServices,
  querySkills,
  queryTasks,
} from "../lib/dashboard-queries";
import {
  configureChatChannelMutation,
  controlServiceMutation,
  clearTaskRunsMutation,
  deleteTaskMutation,
  deleteTaskRunMutation,
  loadTaskRunDetailMutation,
  loadTaskRunsMutation,
  runTaskMutation,
  runAuthorizationActionMutation,
  runChatChannelActionMutation,
  runPluginActionMutation,
  runSkillFindMutation,
  runSkillInstallMutation,
  runSkillLookupMutation,
  saveAuthorizationConfigMutation,
  setTaskStatusMutation,
} from "../lib/dashboard-mutations";
import {
  CONSOLEUI_CONTEXT_ID,
  formatTime,
  getErrorMessage,
  isNotFoundError,
  statusBadgeVariant,
} from "./dashboard/shared";
import { useDashboardRefresh } from "./dashboard/useDashboardRefresh";
import { useDashboardContextActions } from "./dashboard/useDashboardContextActions";
import { useDashboardResourceActions } from "./dashboard/useDashboardResourceActions";
import type {
  UiAgentOption,
  UiChatChannelStatus,
  UiChatHistoryEvent,
  UiConfigStatusItem,
  UiContextArchiveSummary,
  UiChatAuthorizationResponse,
  UiContextSummary,
  UiContextTimelineMessage,
  UiLocalMessage,
  UiLogItem,
  UiModelPoolItem,
  UiModelProviderItem,
  UiModelSummary,
  UiChannelAccountItem,
  UiOverviewResponse,
  UiPromptResponse,
  UiPluginRuntimeItem,
  UiServiceItem,
  UiSkillFindResult,
  UiSkillInstallPayload,
  UiSkillInstallResult,
  UiSkillLookupResult,
  UiSkillSummaryItem,
  UiTaskItem,
  UiTaskRunDetailResponse,
  UiTaskRunSummary,
  UiTaskStatusValue,
  UiEnvItem,
} from "../types/Dashboard";
import type {
  DashboardToastState,
  DashboardToastType,
  UseConsoleDashboardResult,
} from "../types/DashboardHook";

export function useConsoleDashboard(): UseConsoleDashboardResult {
  const [agents, setAgents] = useState<UiAgentOption[]>([]);
  const [cityVersion, setCityVersion] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const [overview, setOverview] = useState<UiOverviewResponse | null>(null);
  const [authorization, setAuthorization] = useState<UiChatAuthorizationResponse | null>(null);
  const [services, setServices] = useState<UiServiceItem[]>([]);
  const [skills, setSkills] = useState<UiSkillSummaryItem[]>([]);
  const [plugins, setPlugins] = useState<UiPluginRuntimeItem[]>([]);
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
  const [toast, setToast] = useState<DashboardToastState | null>(null);
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

  const showToast = useCallback((message: string, type: DashboardToastType = "info") => {
    setToast({ message, type });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const requestJson = useCallback(
    async <T,>(path: string, options: RequestInit = {}, preferredAgentId?: string): Promise<T> => {
      return requestConsoleApiJson<T>({
        path,
        options,
        selectedAgentId,
        preferredAgentId,
      });
    },
    [selectedAgentId],
  );

  const clearPanelDataForNoAgent = useCallback(() => {
    setOverview(null);
    setAuthorization(null);
    setServices([]);
    setSkills([]);
    // 关键点（中文）：plugins 作为全局页信息，保留上次快照，避免无 agent 时整块消失。
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
      const result = await queryAgents({
        requestJson,
        preferredAgentId,
        selectedAgentId,
      });
      if (result.cityVersion) setCityVersion(result.cityVersion);
      const list = result.list;
      const nextId = result.nextAgentId;
      setAgents(list);
      return { nextAgentId: nextId, list };
    },
    [requestJson, selectedAgentId],
  );

  const refreshOverview = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setOverview(await queryOverview(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshServices = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setServices(await queryServices(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshSkills = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setSkills(await querySkills(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshPlugins = useCallback(
    async (agentId: string) => {
      if (!agentId) {
        return;
      }
      const nextPlugins = await queryPlugins(requestJson, agentId);
      setPlugins(nextPlugins);
      return nextPlugins;
    },
    [requestJson],
  );

  const refreshChatChannels = useCallback(
    async (agentId: string): Promise<UiChatChannelStatus[]> => {
      if (!agentId) return [];
      const channels = await queryChatChannels(requestJson, agentId);
      setChatChannels(channels);
      return channels;
    },
    [requestJson],
  );

  const refreshContexts = useCallback(
    async (agentId: string): Promise<UiContextSummary[]> => {
      if (!agentId) return [];
      const nextList = await queryContexts(requestJson, agentId);
      setContexts(nextList);
      return nextList;
    },
    [requestJson],
  );

  const refreshChannelHistory = useCallback(
    async (agentId: string, contextId: string) => {
      if (!agentId || !contextId) return;
      setChannelHistory(await queryChannelHistory(requestJson, agentId, contextId));
    },
    [requestJson],
  );

  const refreshContextMessages = useCallback(
    async (agentId: string, contextId: string) => {
      if (!agentId || !contextId) return;
      setContextMessages(await queryContextMessages(requestJson, agentId, contextId));
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
        const data = await queryContextArchiveDetail(requestJson, agentId, contextId, archiveId);
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
        archives = await queryContextArchives(requestJson, agentId, contextId);
        archiveApiStateRef.current = "supported";
      } catch (error) {
        const message = getErrorMessage(error);
        if (!isNotFoundError(message)) throw error;
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
      setTasks(await queryTasks(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshLogs = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setLogs(await queryLogs(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshModel = useCallback(
    async (agentId: string) => {
      setModel(await queryModel(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshConfigStatus = useCallback(
    async (agentId: string) => {
      setConfigStatus(await queryConfigStatus(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshModelPool = useCallback(async () => {
    const data = await queryModelPool(requestJson);
    setModelProviders(data.providers);
    setModelPoolItems(data.models);
  }, [requestJson]);

  const refreshGlobalEnv = useCallback(async () => {
    setGlobalEnvItems(await queryGlobalEnv(requestJson));
  }, [requestJson]);

  const refreshAgentEnv = useCallback(async (agentId: string) => {
    if (!agentId) {
      setAgentEnvItems([]);
      return;
    }
    setAgentEnvItems(await queryAgentEnv(requestJson, agentId));
  }, [requestJson]);

  const refreshChannelAccounts = useCallback(async () => {
    setChannelAccounts(await queryChannelAccounts(requestJson));
  }, [requestJson]);

  const refreshPrompt = useCallback(
    async (agentId: string, contextId?: string) => {
      if (!agentId) return;
      const resolvedContextId = String(contextId || CONSOLEUI_CONTEXT_ID).trim() || CONSOLEUI_CONTEXT_ID;
      setPrompt(await queryPrompt(requestJson, agentId, resolvedContextId));
    },
    [requestJson],
  );

  const refreshLocalChat = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setLocalMessages(await queryLocalMessages(requestJson, agentId));
    },
    [requestJson],
  );

  const refreshAuthorization = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setAuthorization(await queryAuthorization(requestJson, agentId));
    },
    [requestJson],
  );

  const { refreshDashboard, handleContextChange } = useDashboardRefresh({
    requestJson,
    selectedAgentId,
    selectedContextIdRef,
    setSelectedAgentId,
    setSelectedContextId,
    setAgentEnvItems,
    setTopbarError,
    setTopbarStatus,
    setLoading,
    setChannelHistory,
    setContextMessages,
    setContextArchives,
    setSelectedArchiveId,
    setContextArchiveMessages,
    setPrompt,
    clearPanelDataForNoAgent,
    refreshAgents,
    refreshPlugins,
    refreshModel,
    refreshModelPool,
    refreshChannelAccounts,
    refreshGlobalEnv,
    refreshConfigStatus,
    refreshAgentEnv,
    refreshChatChannels,
    refreshContexts,
    refreshAuthorization,
    refreshOverview,
    refreshServices,
    refreshSkills,
    refreshTasks,
    refreshLogs,
    refreshLocalChat,
    refreshChannelHistory,
    refreshContextMessages,
    refreshContextArchives,
    refreshPrompt,
    showToast,
  });

  const controlService = useCallback(
    async (serviceName: string, action: string) => {
      await controlServiceMutation({
        requestJson,
        serviceName,
        action,
        selectedAgentId,
        refreshServices,
        refreshSkills,
        showToast,
      });
    },
    [refreshServices, refreshSkills, requestJson, selectedAgentId, showToast],
  );

  const runPluginAction = useCallback(
    async (pluginName: string, actionName: string) => {
      return runPluginActionMutation({
        requestJson,
        pluginName,
        actionName,
        selectedAgentId,
        refreshPlugins,
        showToast,
      });
    },
    [refreshPlugins, requestJson, selectedAgentId, showToast],
  );

  const runChatChannelAction = useCallback(
    async (action: "test" | "reconnect" | "open" | "close", channel: string) => {
      await runChatChannelActionMutation({
        requestJson,
        action,
        channel,
        chatChannels,
        selectedAgentId,
        refreshChatChannels,
        refreshServices,
        showToast,
      });
    },
    [chatChannels, refreshChatChannels, refreshServices, requestJson, selectedAgentId, showToast],
  );

  const configureChatChannel = useCallback(
    async (channel: string, config: Record<string, unknown>) => {
      await configureChatChannelMutation({
        requestJson,
        channel,
        config,
        selectedAgentId,
        refreshDashboard,
        showToast,
      });
    },
    [refreshDashboard, requestJson, selectedAgentId, showToast],
  );

  const saveAuthorizationConfig = useCallback(
    async (config: NonNullable<UiChatAuthorizationResponse["config"]>) => {
      await saveAuthorizationConfigMutation({
        requestJson,
        config,
        selectedAgentId,
        setAuthorization,
        showToast,
      });
    },
    [requestJson, selectedAgentId, showToast],
  );

  const runAuthorizationAction = useCallback(
    async (input: {
      action: "setUserRole";
      channel: string;
      userId?: string;
      roleId?: string;
    }) => {
      await runAuthorizationActionMutation({
        requestJson,
        input,
        selectedAgentId,
        setAuthorization,
        showToast,
      });
    },
    [requestJson, selectedAgentId, showToast],
  );

  const runSkillFind = useCallback(
    async (query: string): Promise<UiSkillFindResult | null> => {
      return runSkillFindMutation({
        requestJson,
        query,
        selectedAgentId,
        refreshSkills,
        showToast,
      });
    },
    [refreshSkills, requestJson, selectedAgentId, showToast],
  );

  const runSkillInstall = useCallback(
    async (input: UiSkillInstallPayload): Promise<UiSkillInstallResult | null> => {
      return runSkillInstallMutation({
        requestJson,
        input,
        selectedAgentId,
        refreshSkills,
        showToast,
      });
    },
    [refreshSkills, requestJson, selectedAgentId, showToast],
  );

  const runSkillLookup = useCallback(
    async (name: string): Promise<UiSkillLookupResult | null> => {
      return runSkillLookupMutation({
        requestJson,
        name,
        selectedAgentId,
        showToast,
      });
    },
    [requestJson, selectedAgentId, showToast],
  );

  const runTask = useCallback(
    async (title: string) => {
      await runTaskMutation({
        requestJson,
        title,
        selectedAgentId,
        refreshTasks,
        refreshLogs,
        showToast,
      });
    },
    [refreshLogs, refreshTasks, requestJson, selectedAgentId, showToast],
  );

  const setTaskStatus = useCallback(
    async (title: string, status: UiTaskStatusValue): Promise<boolean> => {
      return setTaskStatusMutation({
        requestJson,
        title,
        status,
        selectedAgentId,
        refreshTasks,
        refreshOverview,
        showToast,
      });
    },
    [refreshOverview, refreshTasks, requestJson, selectedAgentId, showToast],
  );

  const deleteTask = useCallback(
    async (title: string): Promise<boolean> => {
      return deleteTaskMutation({
        requestJson,
        title,
        selectedAgentId,
        refreshTasks,
        refreshOverview,
        refreshLogs,
        showToast,
      });
    },
    [refreshLogs, refreshOverview, refreshTasks, requestJson, selectedAgentId, showToast],
  );

  const loadTaskRuns = useCallback(
    async (title: string, limit = 50): Promise<UiTaskRunSummary[]> => {
      return loadTaskRunsMutation({
        requestJson,
        title,
        limit,
        selectedAgentId,
        showToast,
      });
    },
    [requestJson, selectedAgentId, showToast],
  );

  const deleteTaskRun = useCallback(
    async (title: string, timestamp: string): Promise<boolean> => {
      return deleteTaskRunMutation({
        requestJson,
        title,
        timestamp,
        selectedAgentId,
        refreshLogs,
        showToast,
      });
    },
    [refreshLogs, requestJson, selectedAgentId, showToast],
  );

  const clearTaskRuns = useCallback(
    async (title: string): Promise<boolean> => {
      return clearTaskRunsMutation({
        requestJson,
        title,
        selectedAgentId,
        refreshLogs,
        showToast,
      });
    },
    [refreshLogs, requestJson, selectedAgentId, showToast],
  );

  const loadTaskRunDetail = useCallback(
    async (title: string, timestamp: string): Promise<UiTaskRunDetailResponse | null> => {
      return loadTaskRunDetailMutation({
        requestJson,
        title,
        timestamp,
        selectedAgentId,
        showToast,
      });
    },
    [requestJson, selectedAgentId, showToast],
  );

  const {
    sendConsoleUiMessage,
    clearContextMessages,
    clearChatHistory,
    deleteChatContext,
  } = useDashboardContextActions({
    requestJson,
    selectedAgentId,
    chatInput,
    sending,
    clearingContextMessages,
    clearingChatHistory,
    deletingContextId,
    selectedContextIdRef,
    setSending,
    setClearingContextMessages,
    setClearingChatHistory,
    setDeletingContextId,
    setChatInput,
    setSelectedContextId,
    setChannelHistory,
    setContextMessages,
    setContextArchives,
    setSelectedArchiveId,
    setContextArchiveMessages,
    setPrompt,
    refreshLocalChat,
    refreshChannelHistory,
    refreshContextMessages,
    refreshContextArchives,
    refreshPrompt,
    refreshLogs,
    refreshOverview,
    refreshContexts,
    refreshChatChannels,
    showToast,
  });

  const {
    switchModel,
    switchModelForAgent,
    startAgentFromHistory,
    createAgent,
    pickAgentDirectory,
    inspectAgentDirectory,
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
    importGlobalEnv,
    removeGlobalEnv,
    upsertAgentEnv,
    removeAgentEnv,
    importAgentEnv,
    executeAgentCommand,
  } = useDashboardResourceActions({
    requestJson,
    selectedAgentId,
    refreshDashboard,
    refreshModel,
    refreshModelPool,
    refreshChannelAccounts,
    refreshChatChannels,
    refreshGlobalEnv,
    refreshAgentEnv,
    showToast,
  });

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
    authorization,
    services,
    skills,
    plugins,
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
    refreshAuthorization,
    refreshChatChannels,
    refreshPlugins,
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
    runPluginAction,
    runChatChannelAction,
    configureChatChannel,
    saveAuthorizationConfig,
    runAuthorizationAction,
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
    createAgent,
    pickAgentDirectory,
    inspectAgentDirectory,
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
    importGlobalEnv,
    upsertAgentEnv,
    removeAgentEnv,
    importAgentEnv,
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
