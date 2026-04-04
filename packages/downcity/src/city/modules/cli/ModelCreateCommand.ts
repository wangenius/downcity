/**
 * `city console model create` 交互命令。
 *
 * 关键点（中文）
 * - `create` 是 model 命令组里唯一保留交互式体验的入口。
 * - provider 创建后可立即测试并批量导入发现到的远端模型。
 */

import prompts from "prompts";
import type { Command } from "commander";
import { ConsoleStore } from "@/shared/utils/store/index.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import {
  discoverProviderModels,
  type ProviderDiscoveryResult,
} from "./ModelSupport.js";
import {
  assertProviderType,
  getSupportedProviderTypes,
  parseBooleanOption,
  parseNumberOption,
  parsePositiveIntegerOption,
} from "./ModelCommandShared.js";

async function runInteractiveCreate(options: { json?: boolean }): Promise<void> {
  const asJson = options.json !== false;
  let store: ConsoleStore | null = null;
  try {
    store = new ConsoleStore();
    const createChoice = await prompts({
      type: "select",
      name: "mode",
      message: "选择创建类型",
      choices: [
        { title: "创建 Provider", value: "provider" },
        { title: "创建 Model", value: "model" },
      ],
      initial: 0,
    });
    const mode = String(createChoice.mode || "").trim();
    if (!mode) {
      printResult({
        asJson,
        success: false,
        title: "console model create cancelled",
        payload: { error: "Cancelled" },
      });
      return;
    }

    if (mode === "provider") {
      await runInteractiveProviderCreate(store, asJson);
      return;
    }

    await runInteractiveModelCreate(store, asJson);
  } catch (error) {
    printResult({
      asJson,
      success: false,
      title: "console model create failed",
      payload: { error: error instanceof Error ? error.message : String(error) },
    });
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}

async function runInteractiveProviderCreate(
  store: ConsoleStore,
  asJson: boolean,
): Promise<void> {
  const providerResp = (await prompts([
    {
      type: "text",
      name: "providerId",
      message: "Provider ID",
      validate: (value: string) =>
        String(value || "").trim().length > 0 ? true : "providerId 不能为空",
    },
    {
      type: "select",
      name: "providerType",
      message: "Provider 类型",
      choices: getSupportedProviderTypes().map((item) => ({ title: item, value: item })),
      initial: 0,
    },
    {
      type: "text",
      name: "baseUrl",
      message: "Base URL（可选，留空使用默认）",
      initial: "",
    },
    {
      type: "text",
      name: "apiKey",
      message: "API Key（支持 ${ENV_VAR}）",
      validate: (value: string) =>
        String(value || "").trim().length > 0 ? true : "apiKey 不能为空",
    },
  ])) as {
    providerId?: string;
    providerType?: string;
    baseUrl?: string;
    apiKey?: string;
  };

  const providerId = String(providerResp.providerId || "").trim();
  const providerType = assertProviderType(String(providerResp.providerType || ""));
  if (!providerId) throw new Error("providerId cannot be empty");
  const current = await store.getProvider(providerId);
  if (current) throw new Error(`Provider already exists: ${providerId}`);

  const providerInput = {
    id: providerId,
    type: providerType,
    ...(String(providerResp.baseUrl || "").trim()
      ? { baseUrl: String(providerResp.baseUrl || "").trim() }
      : {}),
    apiKey: String(providerResp.apiKey || "").trim(),
  };
  await store.upsertProvider(providerInput);

  const testConfirm = (await prompts({
    type: "confirm",
    name: "testNow",
    message: "立即测试 provider 并尝试发现可用模型？",
    initial: true,
  })) as { testNow?: boolean };

  let discovery: ProviderDiscoveryResult | undefined;
  if (testConfirm.testNow === true) {
    discovery = await discoverProviderModels({
      providerId,
      providerType,
      baseUrl: providerInput.baseUrl,
      apiKey: providerInput.apiKey,
    });
  }

  const autoAdded: string[] = [];
  if (discovery?.ok && discovery.models.length > 0) {
    const modelPick = (await prompts({
      type: "multiselect",
      name: "modelIds",
      message: "选择要自动添加到模型池的模型（可多选）",
      choices: discovery.models.slice(0, 40).map((id) => ({
        title: id,
        value: id,
        selected: false,
      })),
    })) as { modelIds?: string[] };

    const picked = Array.isArray(modelPick.modelIds) ? modelPick.modelIds : [];
    for (const remoteModelName of picked) {
      const id = String(remoteModelName || "").trim();
      if (!id) continue;
      const exists = store.getModel(id);
      if (exists) continue;
      store.upsertModel({
        id,
        providerId,
        name: id,
      });
      autoAdded.push(id);
    }
  }

  printResult({
    asJson,
    success: true,
    title: "provider created",
    payload: {
      providerId,
      providerType,
      encryptedStorage: "provider.apiKey will be stored encrypted in ~/.downcity/downcity.db",
      ...(discovery
        ? {
            test: {
              ok: discovery.ok,
              status: discovery.status,
              discoveredModels: discovery.models.length,
              error: discovery.error,
            },
          }
        : {}),
      autoAddedModels: autoAdded,
    },
  });
}

async function runInteractiveModelCreate(
  store: ConsoleStore,
  asJson: boolean,
): Promise<void> {
  const providers = await store.listProviders();
  if (providers.length === 0) {
    throw new Error(
      "No provider found. Please run `city console model create` and choose provider first.",
    );
  }

  const modelResp = (await prompts([
    {
      type: "text",
      name: "modelId",
      message: "Model ID（本地标识）",
      validate: (value: string) =>
        String(value || "").trim().length > 0 ? true : "modelId 不能为空",
    },
    {
      type: "select",
      name: "providerId",
      message: "选择 Provider",
      choices: providers.map((provider) => ({
        title: `${provider.id} (${provider.type})`,
        value: provider.id,
      })),
    },
    {
      type: "text",
      name: "modelName",
      message: "上游模型名（如 gpt-4o / claude-sonnet-4-5）",
      validate: (value: string) =>
        String(value || "").trim().length > 0 ? true : "modelName 不能为空",
    },
    {
      type: "text",
      name: "temperature",
      message: "temperature（可选，留空跳过）",
      initial: "",
    },
    {
      type: "text",
      name: "maxTokens",
      message: "maxTokens（可选，留空跳过）",
      initial: "",
    },
  ])) as {
    modelId?: string;
    providerId?: string;
    modelName?: string;
    temperature?: string;
    maxTokens?: string;
  };

  const modelId = String(modelResp.modelId || "").trim();
  const providerId = String(modelResp.providerId || "").trim();
  const modelName = String(modelResp.modelName || "").trim();
  if (!modelId) throw new Error("modelId cannot be empty");
  if (!providerId) throw new Error("providerId cannot be empty");
  if (!modelName) throw new Error("modelName cannot be empty");
  if (store.getModel(modelId)) throw new Error(`Model already exists: ${modelId}`);

  store.upsertModel({
    id: modelId,
    providerId,
    name: modelName,
    ...(String(modelResp.temperature || "").trim()
      ? { temperature: parseNumberOption(String(modelResp.temperature)) }
      : {}),
    ...(String(modelResp.maxTokens || "").trim()
      ? { maxTokens: parsePositiveIntegerOption(String(modelResp.maxTokens)) }
      : {}),
  });

  printResult({
    asJson,
    success: true,
    title: "model created",
    payload: {
      modelId,
      providerId,
      modelName,
    },
  });
}

/**
 * 注册 `city console model create` 交互命令。
 */
export function registerModelCreateCommand(model: Command): void {
  model
    .command("create")
    .description("交互式创建 provider 或 model（唯一交互命令）")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (options: { json?: boolean }) => {
      await runInteractiveCreate(options);
    });
}
