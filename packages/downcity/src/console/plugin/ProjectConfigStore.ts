/**
 * Plugin / Asset 项目配置持久化工具。
 *
 * 关键点（中文）
 * - 新插件体系的用户配置统一写回项目 `downcity.json`。
 * - 这里只负责 `plugins` / `assets` 两个配置域，避免把 runtime 合并态整包落盘。
 * - 这样既能保证重启后配置仍然生效，也能避免把 console 全局配置误写进项目文件。
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { DowncityConfig } from "@/agent/types/DowncityConfig.js";

type PersistableSections = {
  /**
   * 插件配置块（可选）。
   */
  plugins?: DowncityConfig["plugins"];
  /**
   * 资产配置块（可选）。
   */
  assets?: DowncityConfig["assets"];
};

function getProjectDowncityJsonPath(projectRoot: string): string {
  return path.join(path.resolve(projectRoot), "downcity.json");
}

async function readProjectDowncityConfig(projectRoot: string): Promise<DowncityConfig> {
  const downcityJsonPath = getProjectDowncityJsonPath(projectRoot);
  const raw = await fs.readFile(downcityJsonPath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid downcity.json: expected object (${downcityJsonPath})`);
  }
  return parsed as DowncityConfig;
}

/**
 * 将 plugins / assets 配置块写回项目 `downcity.json`。
 */
export async function persistProjectPluginConfig(params: {
  /**
   * 项目根目录。
   */
  projectRoot: string;
  /**
   * 待持久化的配置块。
   */
  sections: PersistableSections;
}): Promise<string> {
  const downcityJsonPath = getProjectDowncityJsonPath(params.projectRoot);
  const current = await readProjectDowncityConfig(params.projectRoot);
  const next: DowncityConfig = {
    ...current,
    ...(params.sections.plugins !== undefined
      ? { plugins: params.sections.plugins }
      : {}),
    ...(params.sections.assets !== undefined
      ? { assets: params.sections.assets }
      : {}),
  };
  await fs.writeFile(downcityJsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return downcityJsonPath;
}
