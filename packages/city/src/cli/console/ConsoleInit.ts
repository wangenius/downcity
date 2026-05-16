/**
 * `city init`：初始化 console（全局中台）的默认配置（`~/.downcity/`）。
 *
 * 生成内容
 * - `~/.downcity/downcity.db`：console 全局配置存储（敏感字段加密）
 * - `~/.downcity/schema/downcity.schema.json`：给项目 downcity.json 的 schema（可选）
 *
 * 关键点（中文）
 * - city 运行时是强依赖：`city start` + `city agent start` 都会使用这里的默认配置。
 * - console 级不再使用 `~/.downcity/downcity.json` 和 `~/.downcity/.env`。
 * - agent 项目内 `downcity.json/.env` 仍保持项目级配置职责。
 */

import path from "node:path";
import fs from "fs-extra";
import { DOWNCITY_JSON_SCHEMA } from "@/config/DowncitySchema.js";
import { saveJson } from "@/utils/storage.js";
import {
  getConsoleRootDirPath,
} from "@/process/registry/CityPaths.js";
import { ConsoleStore } from "@/store/index.js";
import { emitCliBlock, emitCliList } from "../shared/CliReporter.js";

/**
 * console 初始化入口。
 */
export async function consoleInitCommand(): Promise<void> {
  const operationRoot = getConsoleRootDirPath();
  const schemaDir = path.join(operationRoot, "schema");
  const schemaPath = path.join(schemaDir, "downcity.schema.json");

  await fs.ensureDir(operationRoot);

  // 写入 schema（给编辑器使用）
  await fs.ensureDir(schemaDir);
  await saveJson(schemaPath, DOWNCITY_JSON_SCHEMA);

  const modelStore = new ConsoleStore();
  let existingModelsCount = 0;
  try {
    existingModelsCount = modelStore.listModels().length;
    emitCliBlock({
      tone: "success",
      title: "Console base initialized",
      facts: [
        {
          label: "Root",
          value: operationRoot,
        },
        {
          label: "Schema",
          value: schemaPath,
        },
        {
          label: "Existing models",
          value: String(existingModelsCount),
        },
      ],
      note:
        existingModelsCount > 0
          ? "检测到已有模型池。`city init` 不会修改模型配置。"
          : "当前还没有模型池。你可以稍后执行 `city model create` 配置模型。",
    });
  } finally {
    modelStore.close();
  }
  emitCliBlock({
    tone: "success",
    title: "Console initialized",
    summary: "base-only",
    note: "基础设施已初始化。下一步可执行 `city model create` 配置模型。",
  });
  emitCliList({
    tone: "accent",
    title: "Created",
    items: [
      { title: "encrypted console settings" },
      { title: "downcity schema" },
    ],
  });

  // 关键点（中文）：skills 仅使用 `~/.agents/skills`，不做 built-in / claude 自动同步。
}
