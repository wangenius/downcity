/**
 * `sma console model` 命令组。
 *
 * 设计目标（中文）
 * - 把语言模型管理从 `console config` 解耦成独立命令域。
 * - `create` 提供交互式引导（provider / model），降低初次配置门槛。
 * - 其他命令统一非交互，便于脚本化（pause/update/test/list）。
 */

import prompts from "prompts";
import type { Command } from "commander";
import { generateText } from "ai";
import { ConsoleStore } from "@/utils/store/index.js";
import { printResult } from "@agent/utils/CliOutput.js";
import { ModelManager, type ModelPreset } from "@/console/model/ModelManager.js";
import type { LlmProviderType } from "@agent/types/LlmConfig.js";
import { createModel } from "@/console/model/CreateModel.js";
import {
  discoverProviderModels,
  resolveProjectRoot,
  setProjectPrimaryModel,
  type ProviderDiscoveryResult,
} from "./ModelSupport.js";

const SUPPORTED_PROVIDER_TYPES: readonly LlmProviderType[] = [
  "anthropic",
  "openai",
  "deepseek",
  "gemini",
  "open-compatible",
  "open-responses",
  "moonshot",
  "xai",
  "huggingface",
  "openrouter",
];

const modelManager = new ModelManager();

function parseBooleanOption(value: string | undefined): boolean {
  if (value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean: ${value}`);
}

function parseNumberOption(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return num;
}

function parsePositiveIntegerOption(value: string): number {
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || Number.isNaN(num) || !Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return num;
}

function assertProviderType(inputType: string): LlmProviderType {
  const candidate = String(inputType || "").trim() as LlmProviderType;
  if (!SUPPORTED_PROVIDER_TYPES.includes(candidate)) {
    throw new Error(
      `Unsupported provider type: ${inputType}. Supported: ${SUPPORTED_PROVIDER_TYPES.join(", ")}`,
    );
  }
  return candidate;
}

function resolveModelPresetOrThrow(input?: string): ModelPreset | undefined {
  const presetId = String(input || "").trim();
  if (!presetId) return undefined;
  const preset = modelManager.getPreset(presetId);
  if (!preset) throw new Error(`Unknown model preset: ${presetId}`);
  return preset;
}


async function runStoreCommand(
  options: { json?: boolean },
  handler: (store: ConsoleStore) => Promise<{
    title: string;
    payload: Record<string, unknown>;
  }>,
): Promise<void> {
  const asJson = options.json !== false;
  let store: ConsoleStore | null = null;
  try {
    store = new ConsoleStore();
    const result = await handler(store);
    printResult({
      asJson,
      success: true,
      title: result.title,
      payload: result.payload,
    });
  } catch (error) {
    printResult({
      asJson,
      success: false,
      title: "console model command failed",
      payload: {
        error:
          error instanceof Error &&
          String(error.message || "").includes("unable to open database file")
            ? 'Console model store is unavailable. Run "sma console init" first.'
            : error instanceof Error
              ? error.message
              : String(error),
      },
    });
    process.exitCode = 1;
  } finally {
    store?.close();
  }
}

async function runInteractiveCreate(
  options: { json?: boolean },
): Promise<void> {
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
      const providerResp = await prompts([
        {
          type: "text",
          name: "providerId",
          message: "Provider ID",
          validate: (v: string) =>
            String(v || "").trim().length > 0 ? true : "providerId 不能为空",
        },
        {
          type: "select",
          name: "providerType",
          message: "Provider 类型",
          choices: SUPPORTED_PROVIDER_TYPES.map((x) => ({ title: x, value: x })),
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
          validate: (v: string) =>
            String(v || "").trim().length > 0 ? true : "apiKey 不能为空",
        },
      ]) as {
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

      const testConfirm = await prompts({
        type: "confirm",
        name: "testNow",
        message: "立即测试 provider 并尝试发现可用模型？",
        initial: true,
      }) as { testNow?: boolean };

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
        const modelPick = await prompts({
          type: "multiselect",
          name: "modelIds",
          message: "选择要自动添加到模型池的模型（可多选）",
          choices: discovery.models.slice(0, 40).map((id) => ({
            title: id,
            value: id,
            selected: false,
          })),
        }) as { modelIds?: string[] };

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
          encryptedStorage: "provider.apiKey will be stored encrypted in ~/.ship/ship.db",
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
      return;
    }

    const providers = await store.listProviders();
    if (providers.length === 0) {
      throw new Error(
        "No provider found. Please run `sma console model create` and choose provider first.",
      );
    }

    const modelResp = await prompts([
      {
        type: "text",
        name: "modelId",
        message: "Model ID（本地标识）",
        validate: (v: string) =>
          String(v || "").trim().length > 0 ? true : "modelId 不能为空",
      },
      {
        type: "select",
        name: "providerId",
        message: "选择 Provider",
        choices: providers.map((p) => ({
          title: `${p.id} (${p.type})`,
          value: p.id,
        })),
      },
      {
        type: "text",
        name: "modelName",
        message: "上游模型名（如 gpt-4o / claude-sonnet-4-5）",
        validate: (v: string) =>
          String(v || "").trim().length > 0 ? true : "modelName 不能为空",
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
    ]) as {
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

/**
 * 注册 `sma console model` 命令组。
 */
export function registerModelCommand(program: Command): void {
  const model = program
    .command("model")
    .description("管理 console 全局语言模型池（provider/model）")
    .helpOption("--help", "display help for command");

  model
    .command("create")
    .description("交互式创建 provider 或 model（唯一交互命令）")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (options: { json?: boolean }) => {
      await runInteractiveCreate(options);
    });

  model
    .command("list")
    .description("列出 provider 与 model")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (options: { json?: boolean }) => {
      await runStoreCommand(options, async (store) => {
        const providers = await store.listProviders();
        const models = store.listModels();
        return {
          title: "console models listed",
          payload: {
            providers,
            models,
            providerIds: providers.map((x) => x.id),
            modelIds: models.map((x) => x.id),
          },
        };
      });
    });

  const get = model
    .command("get")
    .description("读取 provider/model 详情")
    .helpOption("--help", "display help for command");

  get
    .command("provider <providerId>")
    .description("读取 provider 详情")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (providerId: string, options: { json?: boolean }) => {
      await runStoreCommand(options, async (store) => {
        const id = String(providerId || "").trim();
        if (!id) throw new Error("providerId cannot be empty");
        const provider = await store.getProvider(id);
        if (!provider) throw new Error(`Provider not found: ${id}`);
        return {
          title: "provider loaded",
          payload: {
            providerId: id,
            provider,
          },
        };
      });
    });

  get
    .command("model <modelId>")
    .description("读取 model 详情")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (modelId: string, options: { json?: boolean }) => {
      await runStoreCommand(options, async (store) => {
        const id = String(modelId || "").trim();
        if (!id) throw new Error("modelId cannot be empty");
        const modelConfig = store.getModel(id);
        if (!modelConfig) throw new Error(`Model not found: ${id}`);
        return {
          title: "model loaded",
          payload: {
            modelId: id,
            model: modelConfig,
          },
        };
      });
    });

  model
    .command("discover <providerId>")
    .description("发现 provider 可用模型（非交互）")
    .option("--auto-add [enabled]", "自动写入发现到的模型", parseBooleanOption, false)
    .option("--prefix <prefix>", "自动添加时的 modelId 前缀（默认不加前缀）")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (
      providerId: string,
      options: { autoAdd?: boolean; prefix?: string; json?: boolean },
    ) => {
      await runStoreCommand(options, async (store) => {
        const id = String(providerId || "").trim();
        if (!id) throw new Error("providerId cannot be empty");
        const provider = await store.getProvider(id);
        if (!provider) throw new Error(`Provider not found: ${id}`);
        const discovery = await discoverProviderModels({
          providerId: id,
          providerType: provider.type,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        });
        if (!discovery.ok) {
          throw new Error(discovery.error || `provider discover failed (${discovery.status || "n/a"})`);
        }

        const autoAdded: Array<{ modelId: string; modelName: string }> = [];
        if (options.autoAdd === true) {
          const prefix = String(options.prefix || "").trim();
          for (const remoteModelName of discovery.models) {
            const modelName = String(remoteModelName || "").trim();
            if (!modelName) continue;
            const modelId = prefix ? `${prefix}${modelName}` : modelName;
            if (store.getModel(modelId)) continue;
            store.upsertModel({
              id: modelId,
              providerId: id,
              name: modelName,
            });
            autoAdded.push({ modelId, modelName });
          }
        }

        return {
          title: "provider models discovered",
          payload: {
            providerId: id,
            providerType: provider.type,
            discoveredModels: discovery.models,
            modelCount: discovery.models.length,
            autoAdded,
          },
        };
      });
    });

  model
    .command("pause <modelId>")
    .description("暂停/恢复模型（非交互）")
    .option("--enabled [enabled]", "是否暂停（默认 true）", parseBooleanOption, true)
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (
      modelId: string,
      options: { enabled?: boolean; json?: boolean },
    ) => {
      await runStoreCommand(options, async (store) => {
        const id = String(modelId || "").trim();
        if (!id) throw new Error("modelId cannot be empty");
        store.setModelPaused(id, options.enabled !== false);
        const updated = store.getModel(id);
        return {
          title: "model pause state updated",
          payload: {
            modelId: id,
            isPaused: updated?.isPaused === true,
          },
        };
      });
    });

  const remove = model
    .command("remove")
    .description("删除 provider/model（非交互）")
    .helpOption("--help", "display help for command");

  remove
    .command("provider <providerId>")
    .description("删除 provider（若被 model 引用会失败）")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (providerId: string, options: { json?: boolean }) => {
      await runStoreCommand(options, async (store) => {
        const id = String(providerId || "").trim();
        if (!id) throw new Error("providerId cannot be empty");
        const provider = await store.getProvider(id);
        if (!provider) throw new Error(`Provider not found: ${id}`);
        store.removeProvider(id);
        return {
          title: "provider removed",
          payload: {
            providerId: id,
          },
        };
      });
    });

  remove
    .command("model <modelId>")
    .description("删除 model")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (modelId: string, options: { json?: boolean }) => {
      await runStoreCommand(options, async (store) => {
        const id = String(modelId || "").trim();
        if (!id) throw new Error("modelId cannot be empty");
        const modelConfig = store.getModel(id);
        if (!modelConfig) throw new Error(`Model not found: ${id}`);
        store.removeModel(id);
        return {
          title: "model removed",
          payload: {
            modelId: id,
          },
        };
      });
    });

  model
    .command("use <modelId>")
    .description("把项目 model.primary 绑定到指定模型（非交互）")
    .option("--path <path>", "目标项目根目录（默认当前目录）", ".")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (
      modelId: string,
      options: { path?: string; json?: boolean },
    ) => {
      const asJson = options.json !== false;
      try {
        const store = new ConsoleStore();
        try {
          const id = String(modelId || "").trim();
          if (!id) throw new Error("modelId cannot be empty");
          const exists = store.getModel(id);
          if (!exists) throw new Error(`Model not found in console pool: ${id}`);
        } finally {
          store.close();
        }
        const projectRoot = resolveProjectRoot(options.path);
        const changed = setProjectPrimaryModel(projectRoot, modelId);
        printResult({
          asJson,
          success: true,
          title: "project model.primary updated",
          payload: {
            projectRoot,
            shipJsonPath: changed.shipJsonPath,
            previousPrimary: changed.previousPrimary,
            nextPrimary: changed.nextPrimary,
          },
        });
      } catch (error) {
        printResult({
          asJson,
          success: false,
          title: "console model use failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        process.exitCode = 1;
      }
    });

  const update = model
    .command("update")
    .description("更新 provider/model（非交互）")
    .helpOption("--help", "display help for command");

  update
    .command("provider <providerId>")
    .description("更新 provider")
    .option("--type <type>", "provider 类型")
    .option("--base-url <baseUrl>", "provider baseUrl")
    .option("--api-key <apiKey>", "provider apiKey（支持 ${ENV_VAR}）")
    .option("--clear-base-url", "清空 baseUrl", false)
    .option("--clear-api-key", "清空 apiKey", false)
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (
      providerId: string,
      options: {
        type?: string;
        baseUrl?: string;
        apiKey?: string;
        clearBaseUrl?: boolean;
        clearApiKey?: boolean;
        json?: boolean;
      },
    ) => {
      await runStoreCommand(options, async (store) => {
        const id = String(providerId || "").trim();
        const current = await store.getProvider(id);
        if (!current) throw new Error(`Provider not found: ${id}`);
        if (options.baseUrl !== undefined && options.clearBaseUrl) {
          throw new Error("--base-url and --clear-base-url cannot be used together");
        }
        if (options.apiKey !== undefined && options.clearApiKey) {
          throw new Error("--api-key and --clear-api-key cannot be used together");
        }
        const hasAnyChange =
          options.type !== undefined ||
          options.baseUrl !== undefined ||
          options.apiKey !== undefined ||
          Boolean(options.clearBaseUrl) ||
          Boolean(options.clearApiKey);
        if (!hasAnyChange) throw new Error("No update specified");

        const nextProvider: {
          id: string;
          type: LlmProviderType;
          baseUrl?: string;
          apiKey?: string;
        } = {
          id,
          type: current.type,
          baseUrl: current.baseUrl,
          apiKey: current.apiKey,
        };
        if (options.type !== undefined) nextProvider.type = assertProviderType(options.type);
        if (options.baseUrl !== undefined) nextProvider.baseUrl = options.baseUrl;
        if (options.apiKey !== undefined) nextProvider.apiKey = options.apiKey;
        if (options.clearBaseUrl) delete nextProvider.baseUrl;
        if (options.clearApiKey) nextProvider.apiKey = undefined;
        await store.upsertProvider(nextProvider);
        return {
          title: "provider updated",
          payload: {
            providerId: id,
            provider: {
              ...nextProvider,
              apiKey: nextProvider.apiKey ? "***encrypted-on-write***" : undefined,
            },
          },
        };
      });
    });

  update
    .command("model <modelId>")
    .description("更新 model")
    .option("--provider <providerId>", "provider ID")
    .option("--name <name>", "上游模型名")
    .option("--preset <presetId>", "模型预设 ID")
    .option("--temperature <temperature>", "temperature", parseNumberOption)
    .option("--max-tokens <maxTokens>", "maxTokens", parsePositiveIntegerOption)
    .option("--top-p <topP>", "topP", parseNumberOption)
    .option("--frequency-penalty <frequencyPenalty>", "frequencyPenalty", parseNumberOption)
    .option("--presence-penalty <presencePenalty>", "presencePenalty", parseNumberOption)
    .option("--anthropic-version <anthropicVersion>", "anthropicVersion")
    .option("--clear-temperature", "清空 temperature", false)
    .option("--clear-max-tokens", "清空 maxTokens", false)
    .option("--clear-top-p", "清空 topP", false)
    .option("--clear-frequency-penalty", "清空 frequencyPenalty", false)
    .option("--clear-presence-penalty", "清空 presencePenalty", false)
    .option("--clear-anthropic-version", "清空 anthropicVersion", false)
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (
      modelId: string,
      options: {
        provider?: string;
        name?: string;
        preset?: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        anthropicVersion?: string;
        clearTemperature?: boolean;
        clearMaxTokens?: boolean;
        clearTopP?: boolean;
        clearFrequencyPenalty?: boolean;
        clearPresencePenalty?: boolean;
        clearAnthropicVersion?: boolean;
        json?: boolean;
      },
    ) => {
      await runStoreCommand(options, async (store) => {
        const id = String(modelId || "").trim();
        const current = store.getModel(id);
        if (!current) throw new Error(`Model not found: ${id}`);

        const hasAnyChange =
          options.provider !== undefined ||
          options.name !== undefined ||
          options.preset !== undefined ||
          options.temperature !== undefined ||
          options.maxTokens !== undefined ||
          options.topP !== undefined ||
          options.frequencyPenalty !== undefined ||
          options.presencePenalty !== undefined ||
          options.anthropicVersion !== undefined ||
          Boolean(options.clearTemperature) ||
          Boolean(options.clearMaxTokens) ||
          Boolean(options.clearTopP) ||
          Boolean(options.clearFrequencyPenalty) ||
          Boolean(options.clearPresencePenalty) ||
          Boolean(options.clearAnthropicVersion);
        if (!hasAnyChange) throw new Error("No update specified");

        if (options.temperature !== undefined && options.clearTemperature) {
          throw new Error("--temperature and --clear-temperature cannot be used together");
        }
        if (options.maxTokens !== undefined && options.clearMaxTokens) {
          throw new Error("--max-tokens and --clear-max-tokens cannot be used together");
        }
        if (options.topP !== undefined && options.clearTopP) {
          throw new Error("--top-p and --clear-top-p cannot be used together");
        }
        if (options.frequencyPenalty !== undefined && options.clearFrequencyPenalty) {
          throw new Error(
            "--frequency-penalty and --clear-frequency-penalty cannot be used together",
          );
        }
        if (options.presencePenalty !== undefined && options.clearPresencePenalty) {
          throw new Error(
            "--presence-penalty and --clear-presence-penalty cannot be used together",
          );
        }
        if (options.anthropicVersion !== undefined && options.clearAnthropicVersion) {
          throw new Error(
            "--anthropic-version and --clear-anthropic-version cannot be used together",
          );
        }

        const preset = resolveModelPresetOrThrow(options.preset);
        let providerId = options.provider ? String(options.provider).trim() : current.providerId;
        let name = options.name ? String(options.name).trim() : current.name;
        if (preset) {
          name = preset.id;
          if (options.provider) {
            const provider = await store.getProvider(providerId);
            if (!provider) throw new Error(`Provider not found: ${providerId}`);
            if (provider.type !== preset.providerType) {
              throw new Error(
                `Preset "${preset.id}" expects provider type "${preset.providerType}", but provider "${providerId}" is "${provider.type}".`,
              );
            }
          }
        }

        store.upsertModel({
          id,
          providerId,
          name,
          temperature: options.clearTemperature ? undefined : options.temperature ?? current.temperature,
          maxTokens: options.clearMaxTokens ? undefined : options.maxTokens ?? current.maxTokens,
          topP: options.clearTopP ? undefined : options.topP ?? current.topP,
          frequencyPenalty: options.clearFrequencyPenalty
            ? undefined
            : options.frequencyPenalty ?? current.frequencyPenalty,
          presencePenalty: options.clearPresencePenalty
            ? undefined
            : options.presencePenalty ?? current.presencePenalty,
          anthropicVersion: options.clearAnthropicVersion
            ? undefined
            : options.anthropicVersion ?? current.anthropicVersion,
          isPaused: current.isPaused,
        });
        return {
          title: "model updated",
          payload: {
            modelId: id,
            model: store.getModel(id),
          },
        };
      });
    });

  const test = model
    .command("test")
    .description("测试 provider/model（非交互）")
    .helpOption("--help", "display help for command");

  test
    .command("provider <providerId>")
    .description("测试 provider 连通性并尝试发现模型")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (providerId: string, options: { json?: boolean }) => {
      await runStoreCommand(options, async (store) => {
        const id = String(providerId || "").trim();
        if (!id) throw new Error("providerId cannot be empty");
        const provider = await store.getProvider(id);
        if (!provider) throw new Error(`Provider not found: ${id}`);
        const discovery = await discoverProviderModels({
          providerId: id,
          providerType: provider.type,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
        });
        if (!discovery.ok) {
          throw new Error(discovery.error || `provider test failed (${discovery.status || "n/a"})`);
        }
        return {
          title: "provider test passed",
          payload: {
            providerId: id,
            providerType: provider.type,
            discoveredModels: discovery.models,
            modelCount: discovery.models.length,
            status: discovery.status,
          },
        };
      });
    });

  test
    .command("model <modelId>")
    .description("测试 model 可调用性（真实调用）")
    .option("--prompt <prompt>", "测试提示词", "Reply with exactly: OK")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (
      modelId: string,
      options: { prompt?: string; json?: boolean },
    ) => {
      await runStoreCommand(options, async () => {
        const id = String(modelId || "").trim();
        if (!id) throw new Error("modelId cannot be empty");
        const model = await createModel({
          config: {
            name: "console-model-test",
            version: "1.0.0",
            model: { primary: id },
          },
        });
        const prompt = String(options.prompt || "").trim() || "Reply with exactly: OK";
        const result = await generateText({
          model,
          prompt,
        });
        return {
          title: "model test passed",
          payload: {
            modelId: id,
            prompt,
            text: result.text,
          },
        };
      });
    });
}
