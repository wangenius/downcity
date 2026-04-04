/**
 * Console Dashboard 资源管理动作 Hook。
 *
 * 关键点（中文）
 * - 汇总 agent、model、provider、channel account、env 等配置写操作。
 * - 让主 hook 专注于状态编排，资源管理动作按领域分组收敛。
 */

import { useCallback } from "react";
import { dashboardApiRoutes } from "../../lib/dashboard-api";
import {
  createAgentMutation,
  discoverModelProviderMutation,
  executeAgentCommandMutation,
  importEnvMutation,
  inspectAgentDirectoryMutation,
  pickAgentDirectoryMutation,
  probeChannelAccountMutation,
  restartAgentFromHistoryMutation,
  simplePostRefreshMutation,
  startAgentFromHistoryMutation,
  stopAgentFromHistoryMutation,
  updateAgentExecutionMutation,
  switchModelForAgentMutation,
  switchModelMutation,
} from "../../lib/dashboard-mutations";
import { getErrorMessage } from "./shared";
import type {
  UiAgentCreatePayload,
  UiAgentDirectoryInspection,
  UiAgentInitializationInput,
  UiChannelAccountProbeResult,
  UiCommandExecuteResult,
  UiModelProviderDiscoverResult,
} from "../../types/Dashboard";
import type { DashboardToastType } from "../../types/DashboardHook";

export function useDashboardResourceActions(params: {
  requestJson: <T>(
    path: string,
    options?: RequestInit,
    preferredAgentId?: string,
  ) => Promise<T>;
  selectedAgentId: string;
  refreshDashboard: (preferredAgentId?: string) => Promise<void>;
  refreshModel: (agentId: string) => Promise<void>;
  refreshModelPool: () => Promise<void>;
  refreshChannelAccounts: () => Promise<void>;
  refreshChatChannels: (agentId: string) => Promise<unknown>;
  refreshGlobalEnv: () => Promise<void>;
  refreshAgentEnv: (agentId: string) => Promise<void>;
  showToast: (message: string, type?: DashboardToastType) => void;
}): {
  switchModel: (primaryModelId: string) => Promise<void>;
  switchModelForAgent: (agentId: string, primaryModelId: string) => Promise<void>;
  updateAgentExecution: (input: {
    agentId: string;
    executionMode: "model" | "acp";
    modelId?: string;
    agentType?: string;
  }) => Promise<void>;
  startAgentFromHistory: (
    agentId: string,
    options?: {
      initializeIfNeeded?: boolean;
      initialization?: UiAgentInitializationInput;
    },
  ) => Promise<void>;
  createAgent: (input: UiAgentCreatePayload) => Promise<void>;
  pickAgentDirectory: () => Promise<string>;
  inspectAgentDirectory: (projectRoot: string) => Promise<UiAgentDirectoryInspection | null>;
  restartAgentFromHistory: (agentId: string) => Promise<void>;
  stopAgentFromHistory: (agentId: string) => Promise<void>;
  upsertModelProvider: (input: {
    id: string;
    type: string;
    baseUrl?: string;
    apiKey?: string;
    clearBaseUrl?: boolean;
    clearApiKey?: boolean;
  }) => Promise<void>;
  removeModelProvider: (providerId: string) => Promise<void>;
  testModelProvider: (providerId: string) => Promise<void>;
  discoverModelProvider: (params: {
    providerId: string;
    autoAdd?: boolean;
    prefix?: string;
  }) => Promise<UiModelProviderDiscoverResult | null>;
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
  removeModelPoolItem: (modelId: string) => Promise<void>;
  setModelPoolItemPaused: (modelId: string, isPaused: boolean) => Promise<void>;
  testModelPoolItem: (modelId: string, prompt?: string) => Promise<void>;
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
    clearBotToken?: boolean;
    clearAppId?: boolean;
    clearAppSecret?: boolean;
  }) => Promise<void>;
  probeChannelAccount: (input: {
    channel: string;
    botToken?: string;
    appId?: string;
    appSecret?: string;
    domain?: string;
    sandbox?: boolean;
  }) => Promise<UiChannelAccountProbeResult | null>;
  removeChannelAccount: (id: string) => Promise<void>;
  upsertGlobalEnv: (input: { key: string; description?: string; value: string }) => Promise<void>;
  importGlobalEnv: (raw: string) => Promise<void>;
  removeGlobalEnv: (key: string) => Promise<void>;
  upsertAgentEnv: (input: { agentId: string; key: string; description?: string; value: string }) => Promise<void>;
  removeAgentEnv: (agentIdInput: string, key: string) => Promise<void>;
  importAgentEnv: (agentIdInput: string, raw: string) => Promise<void>;
  executeAgentCommand: (input: {
    command: string;
    timeoutMs?: number;
    agentId?: string;
  }) => Promise<UiCommandExecuteResult>;
} {
  const switchModel = useCallback(
    async (primaryModelId: string) => {
      await switchModelMutation({
        requestJson: params.requestJson,
        primaryModelId,
        selectedAgentId: params.selectedAgentId,
        refreshModel: params.refreshModel,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const switchModelForAgent = useCallback(
    async (agentId: string, primaryModelId: string) => {
      await switchModelForAgentMutation({
        requestJson: params.requestJson,
        agentId,
        primaryModelId,
        selectedAgentId: params.selectedAgentId,
        refreshDashboard: params.refreshDashboard,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const startAgentFromHistory = useCallback(
    async (
      agentId: string,
      options?: {
        initializeIfNeeded?: boolean;
        initialization?: UiAgentInitializationInput;
      },
    ) => {
      await startAgentFromHistoryMutation({
        requestJson: params.requestJson,
        agentId,
        options,
        refreshDashboard: params.refreshDashboard,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const createAgent = useCallback(
    async (input: UiAgentCreatePayload) => {
      await createAgentMutation({
        requestJson: params.requestJson,
        input,
        refreshDashboard: params.refreshDashboard,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const pickAgentDirectory = useCallback(async (): Promise<string> => {
    return pickAgentDirectoryMutation(params.requestJson);
  }, [params]);

  const inspectAgentDirectory = useCallback(
    async (projectRoot: string): Promise<UiAgentDirectoryInspection | null> => {
      return inspectAgentDirectoryMutation(params.requestJson, projectRoot);
    },
    [params],
  );

  const restartAgentFromHistory = useCallback(
    async (agentId: string) => {
      await restartAgentFromHistoryMutation({
        requestJson: params.requestJson,
        agentId,
        refreshDashboard: params.refreshDashboard,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const stopAgentFromHistory = useCallback(
    async (agentId: string) => {
      await stopAgentFromHistoryMutation({
        requestJson: params.requestJson,
        agentId,
        selectedAgentId: params.selectedAgentId,
        refreshDashboard: params.refreshDashboard,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const updateAgentExecution = useCallback(
    async (input: {
      agentId: string;
      executionMode: "model" | "acp";
      modelId?: string;
      agentType?: string;
    }) => {
      await updateAgentExecutionMutation({
        requestJson: params.requestJson,
        agentId: input.agentId,
        executionMode: input.executionMode,
        modelId: input.modelId,
        agentType: input.agentType,
        selectedAgentId: params.selectedAgentId,
        refreshDashboard: params.refreshDashboard,
        showToast: params.showToast,
      });
    },
    [params],
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
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiModelProviderUpsert(),
        body: input,
        successMessage: `provider ${input.id} 已保存`,
        errorMessage: "provider 保存失败",
        after: async () => {
          await Promise.all([params.refreshModelPool(), params.refreshModel(params.selectedAgentId)]);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const removeModelProvider = useCallback(
    async (providerId: string) => {
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiModelProviderRemove(),
        body: { providerId },
        successMessage: `provider ${providerId} 已删除`,
        errorMessage: "provider 删除失败",
        after: async () => {
          await Promise.all([params.refreshModelPool(), params.refreshModel(params.selectedAgentId)]);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const testModelProvider = useCallback(
    async (providerId: string) => {
      try {
        const data = await params.requestJson<{
          success?: boolean;
          modelCount?: number;
        }>(dashboardApiRoutes.uiModelProviderTest(), {
          method: "POST",
          body: JSON.stringify({ providerId }),
        });
        params.showToast(
          `provider ${providerId} 测试通过，发现 ${Number(data.modelCount || 0)} 个模型`,
          "success",
        );
      } catch (error) {
        params.showToast(`provider 测试失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [params],
  );

  const discoverModelProvider = useCallback(
    async (input: {
      providerId: string;
      autoAdd?: boolean;
      prefix?: string;
    }) => {
      return discoverModelProviderMutation({
        requestJson: params.requestJson,
        input,
        selectedAgentId: params.selectedAgentId,
        refreshModelPool: params.refreshModelPool,
        refreshModel: params.refreshModel,
        showToast: params.showToast,
      });
    },
    [params],
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
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiModelItemUpsert(),
        body: {
          ...input,
          temperature: input.temperature?.trim() || undefined,
          maxTokens: input.maxTokens?.trim() || undefined,
          topP: input.topP?.trim() || undefined,
          frequencyPenalty: input.frequencyPenalty?.trim() || undefined,
          presencePenalty: input.presencePenalty?.trim() || undefined,
          anthropicVersion: input.anthropicVersion?.trim() || undefined,
        },
        successMessage: `model ${input.id} 已保存`,
        errorMessage: "model 保存失败",
        after: async () => {
          await Promise.all([params.refreshModelPool(), params.refreshModel(params.selectedAgentId)]);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const removeModelPoolItem = useCallback(
    async (modelId: string) => {
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiModelItemRemove(),
        body: { modelId },
        successMessage: `model ${modelId} 已删除`,
        errorMessage: "model 删除失败",
        after: async () => {
          await Promise.all([params.refreshModelPool(), params.refreshModel(params.selectedAgentId)]);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const setModelPoolItemPaused = useCallback(
    async (modelId: string, isPaused: boolean) => {
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiModelItemPause(),
        body: { modelId, isPaused },
        successMessage: `model ${modelId} 已${isPaused ? "暂停" : "恢复"}`,
        errorMessage: "model 状态更新失败",
        after: async () => {
          await Promise.all([params.refreshModelPool(), params.refreshModel(params.selectedAgentId)]);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const testModelPoolItem = useCallback(
    async (modelId: string, prompt?: string) => {
      try {
        await params.requestJson(dashboardApiRoutes.uiModelItemTest(), {
          method: "POST",
          body: JSON.stringify({
            modelId,
            prompt: String(prompt || "").trim() || undefined,
          }),
        });
        params.showToast(`model ${modelId} 测试通过`, "success");
      } catch (error) {
        params.showToast(`model 测试失败: ${getErrorMessage(error)}`, "error");
      }
    },
    [params],
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
      clearBotToken?: boolean;
      clearAppId?: boolean;
      clearAppSecret?: boolean;
    }) => {
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiChannelAccountUpsert(),
        body: input,
        successMessage: `channel account ${input.id} 已确认`,
        errorMessage: "channel account 确认失败",
        after: async () => {
          await Promise.all([
            params.refreshChannelAccounts(),
            params.refreshChatChannels(params.selectedAgentId),
          ]);
        },
        showToast: params.showToast,
      });
    },
    [params],
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
      return probeChannelAccountMutation({
        requestJson: params.requestJson,
        input,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const removeChannelAccount = useCallback(
    async (id: string) => {
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiChannelAccountRemove(),
        body: { id },
        successMessage: `channel account ${id} 已删除`,
        errorMessage: "channel account 删除失败",
        after: async () => {
          await Promise.all([
            params.refreshChannelAccounts(),
            params.refreshChatChannels(params.selectedAgentId),
          ]);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const upsertGlobalEnv = useCallback(
    async (input: { key: string; description?: string; value: string }) => {
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiEnvUpsert(),
        body: {
          scope: "global",
          key: String(input.key || "").trim(),
          description: String(input.description || "").trim(),
          value: String(input.value ?? ""),
        },
        successMessage: `env ${String(input.key || "").trim()} 已保存`,
        errorMessage: "env 保存失败",
        after: async () => {
          await params.refreshGlobalEnv();
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const importGlobalEnv = useCallback(
    async (raw: string) => {
      await importEnvMutation({
        requestJson: params.requestJson,
        scope: "global",
        raw,
        refresh: params.refreshGlobalEnv,
        showToast: params.showToast,
      });
    },
    [params],
  );

  const removeGlobalEnv = useCallback(
    async (key: string) => {
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiEnvRemove(),
        body: {
          scope: "global",
          key: String(key || "").trim(),
        },
        successMessage: `env ${String(key || "").trim()} 已删除`,
        errorMessage: "env 删除失败",
        after: async () => {
          await params.refreshGlobalEnv();
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const upsertAgentEnv = useCallback(
    async (input: { agentId: string; key: string; description?: string; value: string }) => {
      const agentId = String(input.agentId || "").trim();
      if (!agentId) {
        params.showToast("当前没有可写入的 agent", "error");
        return;
      }
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiEnvUpsert(),
        body: {
          scope: "agent",
          agentId,
          key: String(input.key || "").trim(),
          description: String(input.description || "").trim(),
          value: String(input.value ?? ""),
        },
        successMessage: `agent env ${String(input.key || "").trim()} 已保存`,
        errorMessage: "agent env 保存失败",
        after: async () => {
          await params.refreshAgentEnv(agentId);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const removeAgentEnv = useCallback(
    async (agentIdInput: string, key: string) => {
      const agentId = String(agentIdInput || "").trim();
      if (!agentId) {
        params.showToast("当前没有可删除的 agent env", "error");
        return;
      }
      await simplePostRefreshMutation({
        requestJson: params.requestJson,
        path: dashboardApiRoutes.uiEnvRemove(),
        body: {
          scope: "agent",
          agentId,
          key: String(key || "").trim(),
        },
        successMessage: `agent env ${String(key || "").trim()} 已删除`,
        errorMessage: "agent env 删除失败",
        after: async () => {
          await params.refreshAgentEnv(agentId);
        },
        showToast: params.showToast,
      });
    },
    [params],
  );

  const importAgentEnv = useCallback(
    async (agentIdInput: string, raw: string) => {
      const agentId = String(agentIdInput || "").trim();
      if (!agentId) {
        params.showToast("当前没有可写入的 agent", "error");
        throw new Error("agentId is required");
      }
      await importEnvMutation({
        requestJson: params.requestJson,
        scope: "agent",
        agentId,
        raw,
        refresh: async () => params.refreshAgentEnv(agentId),
        showToast: params.showToast,
      });
    },
    [params],
  );

  const executeAgentCommand = useCallback(
    async (input: {
      command: string;
      timeoutMs?: number;
      agentId?: string;
    }): Promise<UiCommandExecuteResult> => {
      return executeAgentCommandMutation({
        requestJson: params.requestJson,
        input,
        selectedAgentId: params.selectedAgentId,
      });
    },
    [params],
  );

  return {
    switchModel,
    switchModelForAgent,
    updateAgentExecution,
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
  };
}
