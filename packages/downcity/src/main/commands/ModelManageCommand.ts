/**
 * `city console model` 写入与测试命令。
 *
 * 关键点（中文）
 * - 统一承载 add/pause/remove/update/test 这类会写 console store 或依赖实际调用的命令。
 * - 通过共享工具模块复用参数解析与错误输出逻辑。
 */

import type { Command } from "commander";
import { generateText } from "ai";
import { createModel } from "@/main/model/CreateModel.js";
import type { LlmProviderType } from "@/types/LlmConfig.js";
import {
  discoverProviderModels,
} from "./ModelSupport.js";
import {
  assertProviderType,
  parseBooleanOption,
  parseNumberOption,
  parsePositiveIntegerOption,
  resolveModelPresetOrThrow,
  runStoreCommand,
} from "./ModelCommandShared.js";

/**
 * 注册 `add/pause/remove/update/test` 命令。
 */
export function registerModelManageCommands(model: Command): void {
  registerAddCommands(model);
  registerPauseCommand(model);
  registerRemoveCommands(model);
  registerUpdateCommands(model);
  registerTestCommands(model);
}

function registerAddCommands(model: Command): void {
  const add = model
    .command("add")
    .description("新增 provider/model（非交互）")
    .helpOption("--help", "display help for command");

  add
    .command("provider <providerId>")
    .description("新增 provider")
    .requiredOption("--type <type>", "provider 类型")
    .option("--base-url <baseUrl>", "provider baseUrl")
    .requiredOption("--api-key <apiKey>", "provider apiKey（支持 ${ENV_VAR}）")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (
      providerId: string,
      options: {
        type?: string;
        baseUrl?: string;
        apiKey?: string;
        json?: boolean;
      },
    ) => {
      await runStoreCommand(options, async (store) => {
        const id = String(providerId || "").trim();
        if (!id) throw new Error("providerId cannot be empty");
        const exists = await store.getProvider(id);
        if (exists) throw new Error(`Provider already exists: ${id}`);
        const provider = {
          id,
          type: assertProviderType(String(options.type || "")),
          ...(String(options.baseUrl || "").trim()
            ? { baseUrl: String(options.baseUrl || "").trim() }
            : {}),
          apiKey: String(options.apiKey || "").trim(),
        };
        await store.upsertProvider(provider);
        return {
          title: "provider added",
          payload: {
            providerId: id,
            provider: {
              ...provider,
              apiKey: "***encrypted-on-write***",
            },
          },
        };
      });
    });

  add
    .command("model <modelId>")
    .description("新增 model")
    .requiredOption("--provider <providerId>", "provider ID")
    .option("--name <name>", "上游模型名")
    .option("--preset <presetId>", "模型预设 ID")
    .option("--temperature <temperature>", "temperature", parseNumberOption)
    .option("--max-tokens <maxTokens>", "maxTokens", parsePositiveIntegerOption)
    .option("--top-p <topP>", "topP", parseNumberOption)
    .option("--frequency-penalty <frequencyPenalty>", "frequencyPenalty", parseNumberOption)
    .option("--presence-penalty <presencePenalty>", "presencePenalty", parseNumberOption)
    .option("--anthropic-version <anthropicVersion>", "anthropicVersion")
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
        json?: boolean;
      },
    ) => {
      await runStoreCommand(options, async (store) => {
        const id = String(modelId || "").trim();
        if (!id) throw new Error("modelId cannot be empty");
        const exists = store.getModel(id);
        if (exists) throw new Error(`Model already exists: ${id}`);

        const providerId = String(options.provider || "").trim();
        if (!providerId) throw new Error("provider is required");
        const provider = await store.getProvider(providerId);
        if (!provider) throw new Error(`Provider not found: ${providerId}`);

        const preset = resolveModelPresetOrThrow(options.preset);
        let modelName = String(options.name || "").trim();
        if (preset) {
          modelName = preset.id;
          if (!preset.providerTypes.includes(provider.type)) {
            throw new Error(
              `Preset "${preset.id}" expects provider type in "${preset.providerTypes.join(", ")}", but provider "${providerId}" is "${provider.type}".`,
            );
          }
        }
        if (!modelName) {
          throw new Error("name or preset is required");
        }

        store.upsertModel({
          id,
          providerId,
          name: modelName,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          anthropicVersion: options.anthropicVersion,
          isPaused: false,
        });
        return {
          title: "model added",
          payload: {
            modelId: id,
            model: store.getModel(id),
          },
        };
      });
    });
}

function registerPauseCommand(model: Command): void {
  model
    .command("pause <modelId>")
    .description("暂停/恢复模型（非交互）")
    .option("--enabled [enabled]", "是否暂停（默认 true）", parseBooleanOption, true)
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (modelId: string, options: { enabled?: boolean; json?: boolean }) => {
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
}

function registerRemoveCommands(model: Command): void {
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
}

function registerUpdateCommands(model: Command): void {
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
        const providerId = options.provider ? String(options.provider).trim() : current.providerId;
        let name = options.name ? String(options.name).trim() : current.name;
        if (preset) {
          name = preset.id;
          if (options.provider) {
            const provider = await store.getProvider(providerId);
            if (!provider) throw new Error(`Provider not found: ${providerId}`);
            if (!preset.providerTypes.includes(provider.type)) {
              throw new Error(
                `Preset "${preset.id}" expects provider type in "${preset.providerTypes.join(", ")}", but provider "${providerId}" is "${provider.type}".`,
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
}

function registerTestCommands(model: Command): void {
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
    .action(async (modelId: string, options: { prompt?: string; json?: boolean }) => {
      await runStoreCommand(options, async () => {
        const id = String(modelId || "").trim();
        if (!id) throw new Error("modelId cannot be empty");
        const runtimeModel = await createModel({
          config: {
            name: "console-model-test",
            version: "1.0.0",
            execution: { type: "model", modelId: id },
          },
        });
        const prompt = String(options.prompt || "").trim() || "Reply with exactly: OK";
        const result = await generateText({
          model: runtimeModel,
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
