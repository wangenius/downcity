/**
 * `city model` 查询与绑定命令。
 *
 * 关键点（中文）
 * - 这里只处理不修改 console model 池状态的命令。
 * - `use` 虽然会写项目配置，但不会改动 console store，因此也归在这里。
 */

import type { Command } from "commander";
import { ConsoleStore } from "@/shared/utils/store/index.js";
import { printResult } from "@shared/utils/cli/CliOutput.js";
import {
  discoverProviderModels,
  resolveProjectRoot,
  setProjectPrimaryModel,
} from "./ModelSupport.js";
import {
  parseBooleanOption,
  runStoreCommand,
  toSafeProviderView,
} from "./ModelCommandShared.js";

/**
 * 注册 `list/get/discover/use` 命令。
 */
export function registerModelReadCommands(model: Command): void {
  registerListCommand(model);
  registerGetCommands(model);
  registerDiscoverCommand(model);
  registerUseCommand(model);
}

function registerListCommand(model: Command): void {
  model
    .command("list")
    .description("列出 provider 与 model")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (options: { json?: boolean }) => {
      await runStoreCommand(options, async (store) => {
        const providers = (await store.listProviders()).map((item) => toSafeProviderView(item));
        const models = store.listModels();
        return {
          title: "console models listed",
          payload: {
            providers,
            models,
            providerIds: providers.map((item) => item.id),
            modelIds: models.map((item) => item.id),
          },
        };
      });
    });
}

function registerGetCommands(model: Command): void {
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
            provider: toSafeProviderView(provider),
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
}

function registerDiscoverCommand(model: Command): void {
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
}

function registerUseCommand(model: Command): void {
  model
    .command("use <modelId>")
    .description("把项目 execution.modelId 绑定到指定模型（非交互）")
    .option("--path <path>", "目标项目根目录（默认当前目录）", ".")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (modelId: string, options: { path?: string; json?: boolean }) => {
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
          title: "project execution.modelId updated",
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
}
