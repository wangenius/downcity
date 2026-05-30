/**
 * `studio init`：初始化平台级默认配置（`~/.downcity/`）。
 *
 * 生成内容
 * - `~/.downcity/downcity.db`：平台级全局配置存储（敏感字段加密）
 * - `~/.downcity/schema/downcity.schema.json`：给项目 downcity.json 的 schema（可选）
 *
 * 关键点（中文）
 * - Studio runtime是强依赖：`studio start` + `studio agent start` 都会使用这里的默认配置。
 * - 平台级配置不再使用 `~/.downcity/downcity.json` 和 `~/.downcity/.env`。
 * - agent 项目内 `downcity.json/.env` 仍保持项目级配置职责。
 */

import path from "node:path";
import fs from "fs-extra";
import { DOWNCITY_JSON_SCHEMA } from "@/config/DowncitySchema.js";
import { saveJson } from "@/utils/storage.js";
import {
  getPlatformRootDirPath,
} from "@/process/registry/StudioPaths.js";
import { PlatformStore } from "@/platform/store/index.js";
import { emitCliBlock, emitCliList } from "../shared/CliReporter.js";

/**
 * 平台初始化入口。
 */
export async function controlPlaneInitCommand(): Promise<void> {
  const operationRoot = getPlatformRootDirPath();
  const schemaDir = path.join(operationRoot, "schema");
  const schemaPath = path.join(schemaDir, "downcity.schema.json");

  await fs.ensureDir(operationRoot);

  // 写入 schema（给编辑器使用）
  await fs.ensureDir(schemaDir);
  await saveJson(schemaPath, DOWNCITY_JSON_SCHEMA);

  const modelStore = new PlatformStore();
  let existingModelsCount = 0;
  try {
    existingModelsCount = modelStore.listModels().length;
    emitCliBlock({
      tone: "success",
      title: "Platform base initialized",
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
          ? "检测到已有模型池。`studio init` 不会修改模型配置。"
          : "当前还没有模型池。你可以稍后执行 `studio model create` 配置模型。",
    });
  } finally {
    modelStore.close();
  }
  emitCliBlock({
    tone: "success",
    title: "Platform initialized",
    summary: "base-only",
    note: "基础设施已初始化。下一步可执行 `studio model create` 配置模型。",
  });
  emitCliList({
    tone: "accent",
    title: "Created",
    items: [
      { title: "encrypted platform settings" },
      { title: "downcity schema" },
    ],
  });

  // 关键点（中文）：skills 仅使用 `~/.agents/skills`，不做 built-in / claude 自动同步。
}
