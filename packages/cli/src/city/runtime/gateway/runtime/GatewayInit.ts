/**
 * `city init`：初始化平台级默认配置（`~/.downcity/`）。
 *
 * 关键点（中文）
 * - City 根命令只负责初始化全局数据库与运行目录。
 * - 根目录统一经过 `DC_PLATFORM_ROOT`，默认值为 `~/.downcity`。
 * - Agent 配置由全局 DB 管理；项目目录只保留 `.env`、Skills 与运行时数据。
 */

import fs from "fs-extra";
import {
  getPlatformRootDirPath,
  getPlatformStoreDbPath,
} from "@/city/process/registry/CityPaths.js";
import { createCityPlatformStore } from "@/city/runtime/store/index.js";
import { emitCliBlock, emitCliList } from "@/shared/CliReporter.js";

/**
 * 平台初始化入口。
 */
export async function gatewayInitCommand(): Promise<void> {
  const operationRoot = getPlatformRootDirPath();
  await fs.ensureDir(operationRoot);
  const store = createCityPlatformStore();
  store.close();

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
      { label: "Database", value: getPlatformStoreDbPath() },
    ],
  });
  emitCliList({
    tone: "accent",
    title: "Created",
    items: [
      { title: "encrypted platform database" },
    ],
  });

  // 关键点（中文）：skills 仅使用 `~/.agents/skills`，不做 built-in / claude 自动同步。
}
