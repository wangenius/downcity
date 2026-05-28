/**
 * `city model` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `city model` 在交互式终端里进入这里，而不是直接丢给静态 help。
 * - 保留原有脚本化子命令不变，只把高频的人类操作收敛成轻量 manager。
 * - 现在补齐查看、编辑、删除、测试、暂停、绑定、创建这几类高频动作。
 */

import prompts from "prompts";
import { PlatformStore } from "@/platform/store/index.js";
import { ModelPoolService } from "@/model/service/ModelPoolService.js";
import {
  getSupportedProviderTypes,
  toSafeProviderView,
} from "./ModelCommandShared.js";
import {
  discoverProviderModels,
  resolveProjectRoot,
  setProjectPrimaryModel,
} from "./ModelSupport.js";
import { runInteractiveModelCreateFlow } from "./ModelCreateCommand.js";
import { emitCliBlock } from "../shared/CliReporter.js";
import type {
  ModelManagerModelAction,
  ModelManagerModelSummary,
  ModelManagerProviderAction,
  ModelManagerProviderSummary,
  ModelManagerRootAction,
} from "./ModelManagerTypes.js";

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function parseOptionalNumberInput(input: string): number | undefined {
  const value = String(input || "").trim();
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

function parseOptionalPositiveIntegerInput(input: string): number | undefined {
  const value = String(input || "").trim();
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function formatManagerAgentReference(reference: {
  projectRoot: string;
  agentId?: string;
}): string {
  const agentId = String(reference.agentId || "").trim();
  if (agentId) return `${agentId} (${reference.projectRoot})`;
  return reference.projectRoot;
}

async function loadProviderSummaries(): Promise<ModelManagerProviderSummary[]> {
  const store = new PlatformStore();
  try {
    const providers = await store.listProviders();
    const models = store.listModels();
    return providers
      .map((provider) => ({
        id: provider.id,
        type: provider.type,
        baseUrl: provider.baseUrl,
        modelCount: models.filter((model) => model.providerId === provider.id).length,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } finally {
    store.close();
  }
}

function loadModelSummaries(): ModelManagerModelSummary[] {
  const store = new PlatformStore();
  try {
    return store
      .listModels()
      .map((model) => ({
        id: model.id,
        providerId: model.providerId,
        name: model.name,
        isPaused: model.isPaused === true,
        temperature: model.temperature,
        maxTokens: model.maxTokens,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } finally {
    store.close();
  }
}

async function promptRootAction(): Promise<ModelManagerRootAction | null> {
  const providers = await loadProviderSummaries();
  const models = loadModelSummaries();
  const response = (await prompts({
    type: "select",
    name: "action",
    message: "管理全局模型池",
    choices: [
      {
        title: "管理 provider",
        description: `${providers.length} 个 provider`,
        value: "providers",
      },
      {
        title: "管理 model",
        description: `${models.length} 个 model`,
        value: "models",
      },
      {
        title: "创建 provider / model",
        description: "进入现有创建流程",
        value: "create",
      },
      {
        title: "退出",
        description: "关闭 model manager",
        value: "exit",
      },
    ],
    initial: 0,
  })) as { action?: ModelManagerRootAction };

  return response.action || null;
}

async function promptProviderSelection(): Promise<string | null> {
  const providers = await loadProviderSummaries();
  if (providers.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "No providers found",
      note: "运行 `city model create` 或直接在这里选择创建 provider。",
    });
    return null;
  }

  const response = (await prompts({
    type: "select",
    name: "providerId",
    message: "选择要管理的 provider",
    choices: providers.map((provider) => ({
      title: provider.id,
      description: `${provider.type} · ${provider.modelCount} models`,
      value: provider.id,
    })),
    initial: 0,
  })) as { providerId?: string };

  return String(response.providerId || "").trim() || null;
}

async function chooseModelId(): Promise<string | null> {
  const models = loadModelSummaries();
  if (models.length === 0) {
    emitCliBlock({
      tone: "info",
      title: "No models found",
      note: "先创建 provider，再添加或发现 model。",
    });
    return null;
  }

  const response = (await prompts({
    type: "select",
    name: "modelId",
    message: "选择要管理的 model",
    choices: models.map((model) => ({
      title: model.id,
      description: `${model.providerId} · ${model.isPaused ? "paused" : "active"} · ${model.name}`,
      value: model.id,
    })),
    initial: 0,
  })) as { modelId?: string };

  return String(response.modelId || "").trim() || null;
}

async function promptProviderAction(
  providerId: string,
): Promise<ModelManagerProviderAction | null> {
  const response = (await prompts({
    type: "select",
    name: "action",
    message: `管理 provider · ${providerId}`,
    choices: [
      {
        title: "查看详情",
        description: "展示脱敏后的 provider 配置和引用数量",
        value: "details",
      },
      {
        title: "编辑配置",
        description: "修改 provider 类型、baseUrl、apiKey",
        value: "edit",
      },
      {
        title: "测试并发现模型",
        description: "验证连通性，并可批量导入发现结果",
        value: "discover",
      },
      {
        title: "删除 provider",
        description: "仅当没有 model 引用时允许删除",
        value: "remove",
      },
      {
        title: "返回",
        description: "回到上一级菜单",
        value: "back",
      },
    ],
    initial: 0,
  })) as { action?: ModelManagerProviderAction };

  return response.action || null;
}

async function promptModelAction(
  modelId: string,
): Promise<ModelManagerModelAction | null> {
  const response = (await prompts({
    type: "select",
    name: "action",
    message: `管理 model · ${modelId}`,
    choices: [
      {
        title: "查看详情",
        description: "展示当前 model 绑定与运行参数",
        value: "details",
      },
      {
        title: "编辑配置",
        description: "修改 provider、模型名与推理参数",
        value: "edit",
      },
      {
        title: "暂停 / 恢复",
        description: "切换当前 model 的 pause 状态",
        value: "togglePause",
      },
      {
        title: "测试调用",
        description: "真实调用一次模型验证可用性",
        value: "test",
      },
      {
        title: "绑定到项目",
        description: "写入 downcity.json.execution.modelId",
        value: "use",
      },
      {
        title: "删除 model",
        description: "仅当没有 agent 项目引用时允许删除",
        value: "remove",
      },
      {
        title: "返回",
        description: "回到上一级菜单",
        value: "back",
      },
    ],
    initial: 0,
  })) as { action?: ModelManagerModelAction };

  return response.action || null;
}

async function printProviderDetails(providerId: string): Promise<void> {
  const service = new ModelPoolService();
  const usage = await service.getProviderUsage(providerId);
  const safeProvider = toSafeProviderView(usage.provider);
  emitCliBlock({
    tone: "info",
    title: `Provider ${providerId}`,
    summary: usage.provider.type,
    facts: [
      {
        label: "baseUrl",
        value: safeProvider.baseUrl || "default",
      },
      {
        label: "apiKey",
        value: safeProvider.apiKeyMasked || "not set",
      },
      {
        label: "models",
        value: String(usage.models.length),
      },
    ],
  });
}

async function editProvider(providerId: string): Promise<void> {
  const service = new ModelPoolService();
  const usage = await service.getProviderUsage(providerId);
  const provider = usage.provider;
  const providerTypes = getSupportedProviderTypes();
  const currentTypeIndex = Math.max(providerTypes.findIndex((item) => item === provider.type), 0);
  const apiKeyModeInitial = String(provider.apiKey || "").trim() ? 0 : 1;
  const response = (await prompts([
    {
      type: "select",
      name: "providerType",
      message: `编辑 provider · ${providerId} · 类型`,
      choices: providerTypes.map((item) => ({ title: item, value: item })),
      initial: currentTypeIndex,
    },
    {
      type: "text",
      name: "baseUrl",
      message: "Base URL（可选，留空表示清空）",
      initial: provider.baseUrl || "",
    },
    {
      type: "select",
      name: "apiKeyMode",
      message: "API Key 处理方式",
      choices: [
        {
          title: "保持当前值",
          value: "keep",
        },
        {
          title: "替换为新值",
          value: "replace",
        },
        {
          title: "清空 API Key",
          value: "clear",
        },
      ],
      initial: apiKeyModeInitial,
    },
    {
      type: (prev: string) => (prev === "replace" ? "text" : null),
      name: "apiKey",
      message: "新的 API Key",
      validate: (value: string) =>
        String(value || "").trim().length > 0 ? true : "apiKey 不能为空",
    },
  ])) as {
    providerType?: string;
    baseUrl?: string;
    apiKeyMode?: "keep" | "replace" | "clear";
    apiKey?: string;
  };

  if (response.providerType === undefined || response.baseUrl === undefined || response.apiKeyMode === undefined) {
    emitCliBlock({
      tone: "info",
      title: "Provider edit cancelled",
    });
    return;
  }

  const baseUrl = String(response.baseUrl || "").trim();
  const payload = await service.upsertProvider({
    id: providerId,
    type: response.providerType,
    baseUrl: baseUrl || undefined,
    clearBaseUrl: baseUrl.length === 0,
    apiKey: response.apiKeyMode === "replace" ? String(response.apiKey || "").trim() : undefined,
    clearApiKey: response.apiKeyMode === "clear",
  });
  emitCliBlock({
    tone: "success",
    title: `Provider ${providerId}`,
    summary: "updated",
    facts: [
      {
        label: "type",
        value: payload.provider.type,
      },
      {
        label: "baseUrl",
        value: payload.provider.baseUrl || "default",
      },
      {
        label: "apiKey",
        value: payload.provider.apiKeyMasked || "not set",
      },
    ],
  });
}

async function removeProviderFromManager(providerId: string): Promise<boolean> {
  const service = new ModelPoolService();
  const usage = await service.getProviderUsage(providerId);
  if (usage.models.length > 0) {
    emitCliBlock({
      tone: "error",
      title: `Provider ${providerId}`,
      summary: "remove blocked",
      facts: [
        {
          label: "models",
          value: usage.models.map((model) => model.id).join(", "),
        },
      ],
    });
    return false;
  }

  const response = (await prompts({
    type: "confirm",
    name: "confirmed",
    message: `确认删除 provider "${providerId}"？`,
    initial: false,
  })) as { confirmed?: boolean };

  if (response.confirmed !== true) {
    emitCliBlock({
      tone: "info",
      title: "Provider remove cancelled",
    });
    return false;
  }

  await service.removeProvider(providerId);
  emitCliBlock({
    tone: "success",
    title: `Provider ${providerId}`,
    summary: "removed",
  });
  return true;
}

async function discoverProviderAndImport(providerId: string): Promise<void> {
  const store = new PlatformStore();
  try {
    const provider = await store.getProvider(providerId);
    if (!provider) {
      emitCliBlock({
        tone: "error",
        title: "Provider not found",
        note: providerId,
      });
      return;
    }

    const discovery = await discoverProviderModels({
      providerId,
      providerType: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
    });

    if (!discovery.ok) {
      emitCliBlock({
        tone: "error",
        title: `Provider ${providerId}`,
        summary: "test failed",
        facts: [
          {
            label: "type",
            value: provider.type,
          },
          {
            label: "status",
            value: String(discovery.status || "n/a"),
          },
          {
            label: "error",
            value: discovery.error || "Unknown error",
          },
        ],
      });
      return;
    }

    emitCliBlock({
      tone: "success",
      title: `Provider ${providerId}`,
      summary: "test passed",
      facts: [
        {
          label: "type",
          value: provider.type,
        },
        {
          label: "models",
          value: String(discovery.models.length),
        },
        {
          label: "status",
          value: String(discovery.status || "ok"),
        },
      ],
    });

    const missingModels = discovery.models
      .map((modelName) => String(modelName || "").trim())
      .filter(Boolean)
      .filter((modelName) => !store.getModel(modelName));

    if (missingModels.length === 0) {
      emitCliBlock({
        tone: "info",
        title: "No new models to import",
      });
      return;
    }

    const response = (await prompts({
      type: "multiselect",
      name: "modelIds",
      message: "选择要导入到本地模型池的模型",
      choices: missingModels.slice(0, 60).map((modelName) => ({
        title: modelName,
        value: modelName,
        selected: false,
      })),
    })) as { modelIds?: string[] };

    const selected = Array.isArray(response.modelIds) ? response.modelIds : [];
    if (selected.length === 0) {
      emitCliBlock({
        tone: "info",
        title: "Model import skipped",
      });
      return;
    }

    for (const modelName of selected) {
      store.upsertModel({
        id: modelName,
        providerId,
        name: modelName,
      });
    }

    emitCliBlock({
      tone: "success",
      title: "Models imported",
      summary: `${selected.length} added`,
      facts: [
        {
          label: "provider",
          value: providerId,
        },
      ],
    });
  } finally {
    store.close();
  }
}

async function printModelDetails(modelId: string): Promise<void> {
  const service = new ModelPoolService();
  const usage = await service.getModelUsage(modelId);
  const model = usage.model;
  emitCliBlock({
    tone: model.isPaused ? "warning" : "info",
    title: `Model ${modelId}`,
    summary: model.isPaused ? "paused" : "active",
    facts: [
      {
        label: "provider",
        value: model.providerId,
      },
      {
        label: "name",
        value: model.name,
      },
      {
        label: "temperature",
        value: model.temperature === undefined ? "default" : String(model.temperature),
      },
      {
        label: "maxTokens",
        value: model.maxTokens === undefined ? "default" : String(model.maxTokens),
      },
      {
        label: "references",
        value: usage.references.length === 0
          ? "none"
          : usage.references.map((reference) => formatManagerAgentReference(reference)).join(", "),
      },
    ],
  });
}

async function editModel(modelId: string): Promise<void> {
  const service = new ModelPoolService();
  const usage = await service.getModelUsage(modelId);
  const current = usage.model;
  const store = new PlatformStore();
  try {
    const providers = await store.listProviders();
    if (providers.length === 0) {
      emitCliBlock({
        tone: "error",
        title: "No providers found",
        note: "请先创建 provider。",
      });
      return;
    }
    const currentProviderIndex = Math.max(
      providers.findIndex((provider) => provider.id === current.providerId),
      0,
    );
    const response = (await prompts([
      {
        type: "select",
        name: "providerId",
        message: `编辑 model · ${modelId} · Provider`,
        choices: providers.map((provider) => ({
          title: `${provider.id} (${provider.type})`,
          value: provider.id,
        })),
        initial: currentProviderIndex,
      },
      {
        type: "text",
        name: "name",
        message: "上游模型名",
        initial: current.name,
        validate: (value: string) =>
          String(value || "").trim().length > 0 ? true : "模型名不能为空",
      },
      {
        type: "text",
        name: "temperature",
        message: "temperature（可选，留空表示清空）",
        initial: current.temperature === undefined ? "" : String(current.temperature),
      },
      {
        type: "text",
        name: "maxTokens",
        message: "maxTokens（可选，留空表示清空）",
        initial: current.maxTokens === undefined ? "" : String(current.maxTokens),
      },
      {
        type: "text",
        name: "topP",
        message: "topP（可选，留空表示清空）",
        initial: current.topP === undefined ? "" : String(current.topP),
      },
      {
        type: "text",
        name: "frequencyPenalty",
        message: "frequencyPenalty（可选，留空表示清空）",
        initial: current.frequencyPenalty === undefined ? "" : String(current.frequencyPenalty),
      },
      {
        type: "text",
        name: "presencePenalty",
        message: "presencePenalty（可选，留空表示清空）",
        initial: current.presencePenalty === undefined ? "" : String(current.presencePenalty),
      },
      {
        type: "text",
        name: "anthropicVersion",
        message: "anthropicVersion（可选，留空表示清空）",
        initial: current.anthropicVersion || "",
      },
    ])) as {
      providerId?: string;
      name?: string;
      temperature?: string;
      maxTokens?: string;
      topP?: string;
      frequencyPenalty?: string;
      presencePenalty?: string;
      anthropicVersion?: string;
    };

    if (
      response.providerId === undefined ||
      response.name === undefined ||
      response.temperature === undefined ||
      response.maxTokens === undefined ||
      response.topP === undefined ||
      response.frequencyPenalty === undefined ||
      response.presencePenalty === undefined ||
      response.anthropicVersion === undefined
    ) {
      emitCliBlock({
        tone: "info",
        title: "Model edit cancelled",
      });
      return;
    }

    await service.upsertModel({
      id: modelId,
      providerId: response.providerId,
      name: String(response.name || "").trim(),
      temperature: parseOptionalNumberInput(response.temperature),
      maxTokens: parseOptionalPositiveIntegerInput(response.maxTokens),
      topP: parseOptionalNumberInput(response.topP),
      frequencyPenalty: parseOptionalNumberInput(response.frequencyPenalty),
      presencePenalty: parseOptionalNumberInput(response.presencePenalty),
      anthropicVersion: String(response.anthropicVersion || "").trim() || undefined,
      isPaused: current.isPaused,
    });
    emitCliBlock({
      tone: "success",
      title: `Model ${modelId}`,
      summary: "updated",
      facts: [
        {
          label: "provider",
          value: response.providerId,
        },
        {
          label: "name",
          value: String(response.name || "").trim(),
        },
      ],
    });
  } finally {
    store.close();
  }
}

async function removeModelFromManager(modelId: string): Promise<boolean> {
  const service = new ModelPoolService();
  const usage = await service.getModelUsage(modelId);
  if (usage.references.length > 0) {
    emitCliBlock({
      tone: "error",
      title: `Model ${modelId}`,
      summary: "remove blocked",
      facts: [
        {
          label: "agents",
          value: usage.references.map((reference) => formatManagerAgentReference(reference)).join(", "),
        },
      ],
    });
    return false;
  }

  const response = (await prompts({
    type: "confirm",
    name: "confirmed",
    message: `确认删除 model "${modelId}"？`,
    initial: false,
  })) as { confirmed?: boolean };

  if (response.confirmed !== true) {
    emitCliBlock({
      tone: "info",
      title: "Model remove cancelled",
    });
    return false;
  }

  await service.removeModel(modelId);
  emitCliBlock({
    tone: "success",
    title: `Model ${modelId}`,
    summary: "removed",
  });
  return true;
}

async function toggleModelPauseState(modelId: string): Promise<void> {
  const service = new ModelPoolService();
  const usage = await service.getModelUsage(modelId);
  const nextPaused = usage.model.isPaused !== true;
  await service.setModelPaused(modelId, nextPaused);
  emitCliBlock({
    tone: "success",
    title: `Model ${modelId}`,
    summary: nextPaused ? "paused" : "active",
    facts: [
      {
        label: "provider",
        value: usage.model.providerId,
      },
    ],
  });
}

async function testModelCall(modelId: string): Promise<void> {
  const promptInput = (await prompts({
    type: "text",
    name: "prompt",
    message: "测试提示词",
    initial: "Reply with exactly: OK",
  })) as { prompt?: string };

  if (promptInput.prompt === undefined) {
    emitCliBlock({
      tone: "info",
      title: "Model test cancelled",
    });
    return;
  }

  const promptText = String(promptInput.prompt || "").trim() || "Reply with exactly: OK";
  const service = new ModelPoolService();
  const result = await service.testModel(modelId, promptText);
  emitCliBlock({
    tone: "success",
    title: `Model ${modelId}`,
    summary: "test passed",
    facts: [
      {
        label: "prompt",
        value: promptText,
      },
      {
        label: "reply",
        value: result.text,
      },
    ],
  });
}

async function bindModelToProject(modelId: string): Promise<void> {
  const response = (await prompts({
    type: "text",
    name: "projectPath",
    message: "目标项目路径",
    initial: ".",
  })) as { projectPath?: string };

  if (response.projectPath === undefined) {
    emitCliBlock({
      tone: "info",
      title: "Model binding cancelled",
    });
    return;
  }

  const projectRoot = resolveProjectRoot(response.projectPath);
  const changed = setProjectPrimaryModel(projectRoot, modelId);
  emitCliBlock({
    tone: "success",
    title: `Model ${modelId}`,
    summary: "bound",
    facts: [
      {
        label: "project",
        value: projectRoot,
      },
      {
        label: "previous",
        value: changed.previousPrimary || "none",
      },
      {
        label: "current",
        value: changed.nextPrimary,
      },
    ],
  });
}

async function runProviderManager(): Promise<void> {
  const providerId = await promptProviderSelection();
  if (!providerId) return;

  while (true) {
    const action = await promptProviderAction(providerId);
    if (!action) {
      emitCliBlock({
        tone: "info",
        title: "Model manager closed",
      });
      return;
    }
    if (action === "back") return;
    if (action === "details") {
      await printProviderDetails(providerId);
      continue;
    }
    if (action === "edit") {
      await editProvider(providerId);
      continue;
    }
    if (action === "discover") {
      await discoverProviderAndImport(providerId);
      continue;
    }
    if (action === "remove") {
      const removed = await removeProviderFromManager(providerId);
      if (removed) return;
      continue;
    }
  }
}

async function runModelManager(): Promise<void> {
  const modelId = await chooseModelId();
  if (!modelId) return;

  while (true) {
    const action = await promptModelAction(modelId);
    if (!action) {
      emitCliBlock({
        tone: "info",
        title: "Model manager closed",
      });
      return;
    }
    if (action === "back") return;
    if (action === "details") {
      await printModelDetails(modelId);
      continue;
    }
    if (action === "edit") {
      await editModel(modelId);
      continue;
    }
    if (action === "togglePause") {
      await toggleModelPauseState(modelId);
      continue;
    }
    if (action === "test") {
      await testModelCall(modelId);
      continue;
    }
    if (action === "use") {
      await bindModelToProject(modelId);
      continue;
    }
    if (action === "remove") {
      const removed = await removeModelFromManager(modelId);
      if (removed) return;
      continue;
    }
  }
}

/**
 * 运行 `city model` 交互式管理器。
 */
export async function runInteractiveModelManager(): Promise<void> {
  if (!isInteractiveTerminal()) return;

  while (true) {
    const action = await promptRootAction();
    if (!action || action === "exit") {
      emitCliBlock({
        tone: "info",
        title: "Model manager closed",
      });
      return;
    }
    try {
      if (action === "create") {
        await runInteractiveModelCreateFlow({ json: false });
        continue;
      }
      if (action === "providers") {
        await runProviderManager();
        continue;
      }
      if (action === "models") {
        await runModelManager();
      }
    } catch (error) {
      emitCliBlock({
        tone: "error",
        title: "Model manager action failed",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
