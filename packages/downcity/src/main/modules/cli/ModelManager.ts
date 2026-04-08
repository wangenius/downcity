/**
 * `city model` 交互式管理器。
 *
 * 关键点（中文）
 * - 裸 `city model` 在交互式终端里进入这里，而不是直接丢给静态 help。
 * - 保留原有脚本化子命令不变，只把高频的人类操作收敛成轻量 manager。
 * - 只覆盖查看、测试、暂停、绑定、创建这些高频动作，不在这里堆复杂编辑流。
 */

import prompts from "prompts";
import { generateText } from "ai";
import { createModel } from "@/main/city/model/CreateModel.js";
import { ConsoleStore } from "@/shared/utils/store/index.js";
import { toSafeProviderView } from "./ModelCommandShared.js";
import {
  discoverProviderModels,
  resolveProjectRoot,
  setProjectPrimaryModel,
} from "./ModelSupport.js";
import { runInteractiveModelCreateFlow } from "./ModelCreateCommand.js";
import { emitCliBlock } from "./CliReporter.js";
import type {
  ModelManagerModelAction,
  ModelManagerModelSummary,
  ModelManagerProviderAction,
  ModelManagerProviderSummary,
  ModelManagerRootAction,
} from "@/types/cli/ModelManager.js";

function isInteractiveTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

async function loadProviderSummaries(): Promise<ModelManagerProviderSummary[]> {
  const store = new ConsoleStore();
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
  const store = new ConsoleStore();
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
        title: "测试并发现模型",
        description: "验证连通性，并可批量导入发现结果",
        value: "discover",
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
  const store = new ConsoleStore();
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
    const models = store.listModels().filter((model) => model.providerId === providerId);
    const safeProvider = toSafeProviderView(provider);
    emitCliBlock({
      tone: "info",
      title: `Provider ${providerId}`,
      summary: provider.type,
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
          value: String(models.length),
        },
      ],
    });
  } finally {
    store.close();
  }
}

async function discoverProviderAndImport(providerId: string): Promise<void> {
  const store = new ConsoleStore();
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
  const store = new ConsoleStore();
  try {
    const model = store.getModel(modelId);
    if (!model) {
      emitCliBlock({
        tone: "error",
        title: "Model not found",
        note: modelId,
      });
      return;
    }
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
      ],
    });
  } finally {
    store.close();
  }
}

async function toggleModelPauseState(modelId: string): Promise<void> {
  const store = new ConsoleStore();
  try {
    const model = store.getModel(modelId);
    if (!model) {
      emitCliBlock({
        tone: "error",
        title: "Model not found",
        note: modelId,
      });
      return;
    }
    const nextPaused = model.isPaused !== true;
    store.setModelPaused(modelId, nextPaused);
    emitCliBlock({
      tone: "success",
      title: `Model ${modelId}`,
      summary: nextPaused ? "paused" : "active",
      facts: [
        {
          label: "provider",
          value: model.providerId,
        },
      ],
    });
  } finally {
    store.close();
  }
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
  const runtimeModel = await createModel({
    config: {
      name: "console-model-test",
      version: "1.0.0",
      execution: { type: "api", modelId },
    },
  });
  const result = await generateText({
    model: runtimeModel,
    prompt: promptText,
  });
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
    if (action === "discover") {
      await discoverProviderAndImport(providerId);
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
