/**
 * `sma config` 命令组。
 *
 * 目标（中文）
 * - 提供 ship.json 的通用读写能力（get/set/unset）。
 * - 提供 llm provider/model 的结构化管理命令，减少手改 JSON 出错概率。
 * - 所有输出统一支持 JSON（默认）与可读文本两种模式。
 */

import path from "node:path";
import fs from "fs-extra";
import type { Command } from "commander";
import { getShipJsonPath } from "@/main/server/env/Paths.js";
import { printResult } from "@main/utils/CliOutput.js";
import type {
  LlmModelConfig,
  LlmProviderConfig,
  LlmProviderType,
} from "@main/types/LlmConfig.js";
import type { ShipConfig } from "@main/types/ShipConfig.js";

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

function resolveProjectRoot(pathInput?: string): string {
  return path.resolve(String(pathInput || "."));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfigPath(pathInput: string): string[] {
  const trimmed = String(pathInput || "").trim();
  if (!trimmed) {
    throw new Error("Config path cannot be empty");
  }
  const parts = trimmed.split(".");
  if (parts.some((x) => x.trim().length === 0)) {
    throw new Error(`Invalid config path: ${pathInput}`);
  }
  return parts.map((x) => x.trim());
}

function parseConfigValue(rawValue: string): unknown {
  const trimmed = String(rawValue).trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return rawValue;
  }
}

function readShipConfig(projectRoot: string): { shipJsonPath: string; config: ShipConfig } {
  const shipJsonPath = getShipJsonPath(projectRoot);
  if (!fs.existsSync(shipJsonPath)) {
    throw new Error(`ship.json not found at ${shipJsonPath}. Run "shipmyagent init" first.`);
  }
  const raw = fs.readJsonSync(shipJsonPath) as unknown;
  if (!isPlainObject(raw)) {
    throw new Error("Invalid ship.json: expected object");
  }
  const candidate = raw as Partial<ShipConfig>;
  if (typeof candidate.name !== "string" || typeof candidate.version !== "string") {
    throw new Error("Invalid ship.json: missing required fields name/version");
  }
  if (!isPlainObject(candidate.llm)) {
    throw new Error("Invalid ship.json: missing required field llm");
  }
  return { shipJsonPath, config: candidate as ShipConfig };
}

function writeShipConfig(shipJsonPath: string, config: ShipConfig): void {
  fs.writeJsonSync(shipJsonPath, config, { spaces: 2 });
}

function getByPath(
  root: Record<string, unknown>,
  pathTokens: string[],
): { found: boolean; value?: unknown } {
  let cursor: unknown = root;
  for (const token of pathTokens) {
    if (!isPlainObject(cursor) || !(token in cursor)) {
      return { found: false };
    }
    cursor = cursor[token];
  }
  return { found: true, value: cursor };
}

function setByPath(
  root: Record<string, unknown>,
  pathTokens: string[],
  nextValue: unknown,
): { existed: boolean; previous: unknown } {
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < pathTokens.length - 1; i += 1) {
    const key = pathTokens[i];
    const current = cursor[key];
    if (current === undefined) {
      cursor[key] = {};
      cursor = cursor[key] as Record<string, unknown>;
      continue;
    }
    if (!isPlainObject(current)) {
      throw new Error(
        `Cannot set path "${pathTokens.join(".")}": "${pathTokens
          .slice(0, i + 1)
          .join(".")}" is not an object`,
      );
    }
    cursor = current;
  }
  const leaf = pathTokens[pathTokens.length - 1];
  const existed = Object.prototype.hasOwnProperty.call(cursor, leaf);
  const previous = cursor[leaf];
  cursor[leaf] = nextValue;
  return { existed, previous };
}

function unsetByPath(
  root: Record<string, unknown>,
  pathTokens: string[],
): { removed: boolean; previous: unknown } {
  let cursor: Record<string, unknown> = root;
  for (let i = 0; i < pathTokens.length - 1; i += 1) {
    const key = pathTokens[i];
    const current = cursor[key];
    if (!isPlainObject(current)) {
      return { removed: false, previous: undefined };
    }
    cursor = current;
  }
  const leaf = pathTokens[pathTokens.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, leaf)) {
    return { removed: false, previous: undefined };
  }
  const previous = cursor[leaf];
  delete cursor[leaf];
  return { removed: true, previous };
}

function assertProviderType(inputType: string): LlmProviderType {
  const candidate = String(inputType).trim() as LlmProviderType;
  if (!SUPPORTED_PROVIDER_TYPES.includes(candidate)) {
    throw new Error(
      `Unsupported provider type: ${inputType}. Supported: ${SUPPORTED_PROVIDER_TYPES.join(", ")}`,
    );
  }
  return candidate;
}

function ensureLlmCollections(config: ShipConfig): {
  providers: Record<string, LlmProviderConfig>;
  models: Record<string, LlmModelConfig>;
} {
  if (!isPlainObject(config.llm)) {
    throw new Error("Invalid ship.json: llm must be an object");
  }
  if (!isPlainObject(config.llm.providers)) {
    config.llm.providers = {};
  }
  if (!isPlainObject(config.llm.models)) {
    config.llm.models = {};
  }
  return {
    providers: config.llm.providers as Record<string, LlmProviderConfig>,
    models: config.llm.models as Record<string, LlmModelConfig>,
  };
}

function runConfigCommand(
  options: { path?: string; json?: boolean },
  handler: (input: {
    projectRoot: string;
    shipJsonPath: string;
    config: ShipConfig;
  }) => {
    title: string;
    payload: Record<string, unknown>;
    save?: boolean;
  },
): void {
  const asJson = options.json !== false;
  try {
    const projectRoot = resolveProjectRoot(options.path);
    const { shipJsonPath, config } = readShipConfig(projectRoot);
    const result = handler({ projectRoot, shipJsonPath, config });
    if (result.save) {
      writeShipConfig(shipJsonPath, config);
    }
    printResult({
      asJson,
      success: true,
      title: result.title,
      payload: {
        projectRoot,
        shipJsonPath,
        ...result.payload,
      },
    });
  } catch (error) {
    printResult({
      asJson,
      success: false,
      title: "config command failed",
      payload: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    process.exitCode = 1;
  }
}

function applyCommonOptions(command: Command): Command {
  return command
    .option("--path <path>", "项目根目录（默认当前目录）", ".")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true);
}

/**
 * 注册 `sma config` 命令组。
 */
export function registerConfigCommand(program: Command): void {
  const config = program
    .command("config")
    .description("管理 ship.json 配置（含 llm provider/model）")
    .helpOption("--help", "display help for command");

  applyCommonOptions(
    config
      .command("get [keyPath]")
      .description("读取 ship.json（可选读取单个路径）")
      .helpOption("--help", "display help for command"),
  ).action((keyPath: string | undefined, options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: shipConfig }) => {
      if (!keyPath) {
        return {
          title: "config loaded",
          payload: { config: shipConfig },
        };
      }
      const pathTokens = parseConfigPath(keyPath);
      const got = getByPath(shipConfig as unknown as Record<string, unknown>, pathTokens);
      if (!got.found) {
        throw new Error(`Config path not found: ${keyPath}`);
      }
      return {
        title: "config value loaded",
        payload: {
          keyPath,
          value: got.value,
        },
      };
    });
  });

  applyCommonOptions(
    config
      .command("set <keyPath> <value>")
      .description("设置 ship.json 指定路径的值（value 支持 JSON 字面量）")
      .helpOption("--help", "display help for command"),
  ).action(
    (
      keyPath: string,
      value: string,
      options: { path?: string; json?: boolean },
    ) => {
      runConfigCommand(options, ({ config: shipConfig }) => {
        const pathTokens = parseConfigPath(keyPath);
        const parsed = parseConfigValue(value);
        const changed = setByPath(
          shipConfig as unknown as Record<string, unknown>,
          pathTokens,
          parsed,
        );
        return {
          title: "config value updated",
          save: true,
          payload: {
            keyPath,
            value: parsed,
            existed: changed.existed,
            previous: changed.previous,
          },
        };
      });
    },
  );

  applyCommonOptions(
    config
      .command("unset <keyPath>")
      .description("删除 ship.json 指定路径")
      .helpOption("--help", "display help for command"),
  ).action((keyPath: string, options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: shipConfig }) => {
      const pathTokens = parseConfigPath(keyPath);
      const removed = unsetByPath(
        shipConfig as unknown as Record<string, unknown>,
        pathTokens,
      );
      if (!removed.removed) {
        throw new Error(`Config path not found: ${keyPath}`);
      }
      return {
        title: "config value removed",
        save: true,
        payload: {
          keyPath,
          previous: removed.previous,
        },
      };
    });
  });

  const llm = config
    .command("llm")
    .description("管理 ship.json.llm 配置")
    .helpOption("--help", "display help for command");

  const provider = llm
    .command("provider")
    .alias("providers")
    .description("管理 llm.providers")
    .helpOption("--help", "display help for command");

  applyCommonOptions(
    provider
      .command("list")
      .description("列出 providers")
      .helpOption("--help", "display help for command"),
  ).action((options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: shipConfig }) => {
      const { providers } = ensureLlmCollections(shipConfig);
      return {
        title: "providers listed",
        payload: {
          providers,
          providerIds: Object.keys(providers),
        },
      };
    });
  });

  applyCommonOptions(
    provider
      .command("add <providerId>")
      .description("新增 provider")
      .requiredOption("--type <type>", "provider 类型")
      .option("--base-url <baseUrl>", "provider baseUrl")
      .option("--api-key <apiKey>", "provider apiKey（建议使用 ${ENV_VAR}）")
      .helpOption("--help", "display help for command"),
  ).action(
    (
      providerId: string,
      options: {
        path?: string;
        json?: boolean;
        type: string;
        baseUrl?: string;
        apiKey?: string;
      },
    ) => {
      runConfigCommand(options, ({ config: shipConfig }) => {
        const { providers } = ensureLlmCollections(shipConfig);
        const id = String(providerId || "").trim();
        if (!id) throw new Error("providerId cannot be empty");
        if (providers[id]) throw new Error(`Provider already exists: ${id}`);
        const nextProvider: LlmProviderConfig = {
          type: assertProviderType(options.type),
          ...(typeof options.baseUrl === "string" ? { baseUrl: options.baseUrl } : {}),
          ...(typeof options.apiKey === "string" ? { apiKey: options.apiKey } : {}),
        };
        providers[id] = nextProvider;
        return {
          title: "provider added",
          save: true,
          payload: {
            providerId: id,
            provider: nextProvider,
          },
        };
      });
    },
  );

  applyCommonOptions(
    provider
      .command("update <providerId>")
      .description("更新 provider")
      .option("--type <type>", "provider 类型")
      .option("--base-url <baseUrl>", "provider baseUrl")
      .option("--api-key <apiKey>", "provider apiKey（建议使用 ${ENV_VAR}）")
      .option("--clear-base-url", "清空 baseUrl", false)
      .option("--clear-api-key", "清空 apiKey", false)
      .helpOption("--help", "display help for command"),
  ).action(
    (
      providerId: string,
      options: {
        path?: string;
        json?: boolean;
        type?: string;
        baseUrl?: string;
        apiKey?: string;
        clearBaseUrl?: boolean;
        clearApiKey?: boolean;
      },
    ) => {
      runConfigCommand(options, ({ config: shipConfig }) => {
        const { providers } = ensureLlmCollections(shipConfig);
        const id = String(providerId || "").trim();
        const current = providers[id];
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
        if (!hasAnyChange) {
          throw new Error("No update specified");
        }

        const nextProvider: LlmProviderConfig = { ...current };
        if (options.type !== undefined) nextProvider.type = assertProviderType(options.type);
        if (options.baseUrl !== undefined) nextProvider.baseUrl = options.baseUrl;
        if (options.apiKey !== undefined) nextProvider.apiKey = options.apiKey;
        if (options.clearBaseUrl) delete nextProvider.baseUrl;
        if (options.clearApiKey) delete nextProvider.apiKey;
        providers[id] = nextProvider;

        return {
          title: "provider updated",
          save: true,
          payload: {
            providerId: id,
            provider: nextProvider,
          },
        };
      });
    },
  );

  applyCommonOptions(
    provider
      .command("remove <providerId>")
      .description("删除 provider（若被 model 引用会拒绝）")
      .helpOption("--help", "display help for command"),
  ).action((providerId: string, options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: shipConfig }) => {
      const { providers, models } = ensureLlmCollections(shipConfig);
      const id = String(providerId || "").trim();
      if (!providers[id]) throw new Error(`Provider not found: ${id}`);
      const referencedBy = Object.entries(models)
        .filter(([, model]) => model.provider === id)
        .map(([modelId]) => modelId);
      if (referencedBy.length > 0) {
        throw new Error(
          `Provider "${id}" is referenced by models: ${referencedBy.join(", ")}. Remove or migrate these models first.`,
        );
      }
      delete providers[id];
      return {
        title: "provider removed",
        save: true,
        payload: {
          providerId: id,
        },
      };
    });
  });

  const model = llm
    .command("model")
    .alias("models")
    .description("管理 llm.models 与 llm.activeModel")
    .helpOption("--help", "display help for command");

  applyCommonOptions(
    model
      .command("list")
      .description("列出 models")
      .helpOption("--help", "display help for command"),
  ).action((options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: shipConfig }) => {
      const { models } = ensureLlmCollections(shipConfig);
      return {
        title: "models listed",
        payload: {
          activeModel: shipConfig.llm.activeModel,
          models,
          modelIds: Object.keys(models),
        },
      };
    });
  });

  applyCommonOptions(
    model
      .command("add <modelId>")
      .description("新增 model")
      .requiredOption("--provider <providerId>", "provider ID")
      .requiredOption("--name <name>", "模型名称")
      .option("--temperature <temperature>", "temperature", parseNumberOption)
      .option("--max-tokens <maxTokens>", "maxTokens", parsePositiveIntegerOption)
      .option("--top-p <topP>", "topP", parseNumberOption)
      .option(
        "--frequency-penalty <frequencyPenalty>",
        "frequencyPenalty",
        parseNumberOption,
      )
      .option(
        "--presence-penalty <presencePenalty>",
        "presencePenalty",
        parseNumberOption,
      )
      .option("--anthropic-version <anthropicVersion>", "anthropicVersion")
      .helpOption("--help", "display help for command"),
  ).action(
    (
      modelId: string,
      options: {
        path?: string;
        json?: boolean;
        provider: string;
        name: string;
        temperature?: number;
        maxTokens?: number;
        topP?: number;
        frequencyPenalty?: number;
        presencePenalty?: number;
        anthropicVersion?: string;
      },
    ) => {
      runConfigCommand(options, ({ config: shipConfig }) => {
        const { providers, models } = ensureLlmCollections(shipConfig);
        const id = String(modelId || "").trim();
        if (!id) throw new Error("modelId cannot be empty");
        if (models[id]) throw new Error(`Model already exists: ${id}`);
        const providerId = String(options.provider || "").trim();
        if (!providerId) throw new Error("provider cannot be empty");
        if (!providers[providerId]) throw new Error(`Provider not found: ${providerId}`);

        const nextModel: LlmModelConfig = {
          provider: providerId,
          name: options.name,
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}),
          ...(options.topP !== undefined ? { topP: options.topP } : {}),
          ...(options.frequencyPenalty !== undefined
            ? { frequencyPenalty: options.frequencyPenalty }
            : {}),
          ...(options.presencePenalty !== undefined
            ? { presencePenalty: options.presencePenalty }
            : {}),
          ...(options.anthropicVersion !== undefined
            ? { anthropicVersion: options.anthropicVersion }
            : {}),
        };

        models[id] = nextModel;
        return {
          title: "model added",
          save: true,
          payload: {
            modelId: id,
            model: nextModel,
          },
        };
      });
    },
  );

  applyCommonOptions(
    model
      .command("update <modelId>")
      .description("更新 model")
      .option("--provider <providerId>", "provider ID")
      .option("--name <name>", "模型名称")
      .option("--temperature <temperature>", "temperature", parseNumberOption)
      .option("--max-tokens <maxTokens>", "maxTokens", parsePositiveIntegerOption)
      .option("--top-p <topP>", "topP", parseNumberOption)
      .option(
        "--frequency-penalty <frequencyPenalty>",
        "frequencyPenalty",
        parseNumberOption,
      )
      .option(
        "--presence-penalty <presencePenalty>",
        "presencePenalty",
        parseNumberOption,
      )
      .option("--anthropic-version <anthropicVersion>", "anthropicVersion")
      .option("--clear-temperature", "清空 temperature", false)
      .option("--clear-max-tokens", "清空 maxTokens", false)
      .option("--clear-top-p", "清空 topP", false)
      .option("--clear-frequency-penalty", "清空 frequencyPenalty", false)
      .option("--clear-presence-penalty", "清空 presencePenalty", false)
      .option("--clear-anthropic-version", "清空 anthropicVersion", false)
      .helpOption("--help", "display help for command"),
  ).action(
    (
      modelId: string,
      options: {
        path?: string;
        json?: boolean;
        provider?: string;
        name?: string;
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
      },
    ) => {
      runConfigCommand(options, ({ config: shipConfig }) => {
        const { providers, models } = ensureLlmCollections(shipConfig);
        const id = String(modelId || "").trim();
        const current = models[id];
        if (!current) throw new Error(`Model not found: ${id}`);

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

        const hasAnyChange =
          options.provider !== undefined ||
          options.name !== undefined ||
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
        if (!hasAnyChange) {
          throw new Error("No update specified");
        }

        const nextModel: LlmModelConfig = { ...current };
        if (options.provider !== undefined) {
          const nextProviderId = String(options.provider).trim();
          if (!nextProviderId) throw new Error("provider cannot be empty");
          if (!providers[nextProviderId]) {
            throw new Error(`Provider not found: ${nextProviderId}`);
          }
          nextModel.provider = nextProviderId;
        }
        if (options.name !== undefined) nextModel.name = options.name;
        if (options.temperature !== undefined) nextModel.temperature = options.temperature;
        if (options.maxTokens !== undefined) nextModel.maxTokens = options.maxTokens;
        if (options.topP !== undefined) nextModel.topP = options.topP;
        if (options.frequencyPenalty !== undefined) {
          nextModel.frequencyPenalty = options.frequencyPenalty;
        }
        if (options.presencePenalty !== undefined) {
          nextModel.presencePenalty = options.presencePenalty;
        }
        if (options.anthropicVersion !== undefined) {
          nextModel.anthropicVersion = options.anthropicVersion;
        }
        if (options.clearTemperature) delete nextModel.temperature;
        if (options.clearMaxTokens) delete nextModel.maxTokens;
        if (options.clearTopP) delete nextModel.topP;
        if (options.clearFrequencyPenalty) delete nextModel.frequencyPenalty;
        if (options.clearPresencePenalty) delete nextModel.presencePenalty;
        if (options.clearAnthropicVersion) delete nextModel.anthropicVersion;

        models[id] = nextModel;
        return {
          title: "model updated",
          save: true,
          payload: {
            modelId: id,
            model: nextModel,
          },
        };
      });
    },
  );

  applyCommonOptions(
    model
      .command("activate <modelId>")
      .description("切换 llm.activeModel")
      .helpOption("--help", "display help for command"),
  ).action((modelId: string, options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: shipConfig }) => {
      const { models } = ensureLlmCollections(shipConfig);
      const id = String(modelId || "").trim();
      if (!models[id]) {
        throw new Error(`Model not found: ${id}`);
      }
      const previous = shipConfig.llm.activeModel;
      shipConfig.llm.activeModel = id;
      return {
        title: "active model switched",
        save: true,
        payload: {
          activeModel: id,
          previousActiveModel: previous,
        },
      };
    });
  });

  applyCommonOptions(
    model
      .command("remove <modelId>")
      .description("删除 model（当前 activeModel 不允许删除）")
      .helpOption("--help", "display help for command"),
  ).action((modelId: string, options: { path?: string; json?: boolean }) => {
    runConfigCommand(options, ({ config: shipConfig }) => {
      const { models } = ensureLlmCollections(shipConfig);
      const id = String(modelId || "").trim();
      if (!models[id]) throw new Error(`Model not found: ${id}`);
      if (shipConfig.llm.activeModel === id) {
        throw new Error(
          `Cannot remove active model "${id}". Please run "sma config llm model activate <anotherModelId>" first.`,
        );
      }
      delete models[id];
      return {
        title: "model removed",
        save: true,
        payload: {
          modelId: id,
        },
      };
    });
  });
}
