/**
 * `town model` 查询、测试与绑定命令。
 *
 * 关键点（中文）
 * - Town 不再管理模型池。
 * - `town model list` 读取 City AIService 暴露的模型目录。
 * - `town model use` 只把 City AIService 的 model id 写入项目配置。
 */

import type { Command } from "commander";
import { generateText } from "ai";
import { printResult } from "@/utils/cli/CliOutput.js";
import {
  resolveProjectRoot,
  setProjectPrimaryModel,
} from "./ModelSupport.js";
import { parseBooleanOption } from "./ModelCommandShared.js";
import {
  assertCityAiModelReady,
  listCityAiServiceModelsForAdmin,
  listCityAiServiceModelsForUser,
} from "@/model/runtime/CityAiServiceBinding.js";
import { createRuntimeModel } from "@/model/runtime/CreateRuntimeModel.js";
import { mergeProcessEnvWithPlatformGlobalEnv } from "@/env/ProcessEnv.js";

/**
 * 注册 `list/use/test` 命令。
 */
export function registerModelReadCommands(model: Command): void {
  registerListCommand(model);
  registerUseCommand(model);
  registerTestCommand(model);
}

function normalizeModelId(modelId: string): string {
  const id = String(modelId || "").trim();
  if (!id) throw new Error("modelId cannot be empty");
  return id;
}

function registerListCommand(model: Command): void {
  model
    .command("list")
    .description("列出 City AIService 暴露的模型")
    .option("--admin [enabled]", "使用 admin 身份列出完整模型目录", parseBooleanOption, false)
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (options: { admin?: boolean; json?: boolean }) => {
      const asJson = options.json !== false;
      try {
        const models = options.admin === true
          ? await listCityAiServiceModelsForAdmin()
          : await listCityAiServiceModelsForUser();
        printResult({
          asJson,
          success: true,
          title: "city ai models listed",
          payload: {
            source: "City AIService",
            models,
            modelIds: models.map((item) => item.id),
          },
        });
      } catch (error) {
        printResult({
          asJson,
          success: false,
          title: "city ai model list failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        process.exitCode = 1;
      }
    });
}

function registerUseCommand(model: Command): void {
  model
    .command("use <modelId>")
    .description("把项目 execution.modelId 绑定到 City AIService 模型")
    .option("--path <path>", "目标项目根目录（默认当前目录）", ".")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (modelId: string, options: { path?: string; json?: boolean }) => {
      const asJson = options.json !== false;
      try {
        const id = normalizeModelId(modelId);
        await assertCityAiModelReady(id);
        const projectRoot = resolveProjectRoot(options.path);
        const changed = setProjectPrimaryModel(projectRoot, id);
        printResult({
          asJson,
          success: true,
          title: "project execution.modelId updated",
          payload: {
            source: "City AIService",
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
          title: "city ai model use failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        process.exitCode = 1;
      }
    });
}

function registerTestCommand(model: Command): void {
  model
    .command("test <modelId>")
    .description("通过 City AIService 测试模型可调用性")
    .option("--prompt <prompt>", "测试提示词", "Reply with exactly: OK")
    .option("--json [enabled]", "以 JSON 输出", parseBooleanOption, true)
    .helpOption("--help", "display help for command")
    .action(async (modelId: string, options: { prompt?: string; json?: boolean }) => {
      const asJson = options.json !== false;
      try {
        const id = normalizeModelId(modelId);
        const runtimeModel = await createRuntimeModel({
          config: {
            id: "city_ai_model_test",
            version: "1.0.0",
            execution: { type: "api", modelId: id },
          },
          env: mergeProcessEnvWithPlatformGlobalEnv(process.env),
        });
        const prompt = String(options.prompt || "").trim() || "Reply with exactly: OK";
        const result = await generateText({
          model: runtimeModel,
          prompt,
        });
        printResult({
          asJson,
          success: true,
          title: "city ai model test passed",
          payload: {
            source: "City AIService",
            modelId: id,
            prompt,
            text: result.text,
          },
        });
      } catch (error) {
        printResult({
          asJson,
          success: false,
          title: "city ai model test failed",
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        process.exitCode = 1;
      }
    });
}
