/**
 * `city init`：初始化平台级默认配置（`~/.downcity/`）。
 *
 * 生成内容
 * - `~/.downcity/schema/downcity.schema.json`：给项目 downcity.json 的 schema（可选）
 *
 * 关键点（中文）
 * - City runtime是强依赖：`city start` + `city agent start` 都会使用这里的默认配置。
 * - 平台级配置不再使用 `~/.downcity/downcity.json` 和 `~/.downcity/.env`。
 * - agent 项目内 `downcity.json/.env` 仍保持项目级配置职责。
 */

import path from "node:path";
import fs from "fs-extra";
import { DOWNCITY_JSON_SCHEMA } from "@/city/config/DowncitySchema.js";
import { saveJson } from "@/city/utils/storage.js";
import {
  getPlatformRootDirPath,
} from "@/city/process/registry/CityPaths.js";
import { emitCliBlock, emitCliList } from "@/shared/CliReporter.js";

/**
 * 平台初始化入口。
 */
export async function gatewayInitCommand(): Promise<void> {
  const operationRoot = getPlatformRootDirPath();
  const schemaDir = path.join(operationRoot, "schema");
  const schemaPath = path.join(schemaDir, "downcity.schema.json");

  await fs.ensureDir(operationRoot);

  // 写入 schema（给编辑器使用）
  await fs.ensureDir(schemaDir);
  await saveJson(schemaPath, DOWNCITY_JSON_SCHEMA);

  emitCliBlock({
    tone: "success",
    title: "Platform initialized",
    summary: "base-only",
    note: "基础设施已初始化。模型由 City AIService 暴露，City 只负责绑定 modelId。",
    facts: [
      {
        label: "Root",
        value: operationRoot,
      },
      {
        label: "Schema",
        value: schemaPath,
      },
    ],
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
