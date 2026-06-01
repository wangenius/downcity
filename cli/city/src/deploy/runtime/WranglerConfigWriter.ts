/**
 * Wrangler 配置写入器。
 *
 * 关键点（中文）
 * - `city.json` 是简单的 City 项目声明，Wrangler 配置是部署时临时生成物。
 * - Cloudflare 默认值由 CLI 管理，用户不需要在 `city.json` 里写 worker_name 等细节。
 * - D1 database id 从项目 `.env` 读取，不污染用户手写配置。
 */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  CityProjectConfigFile,
  CityProjectDeployEnvFile,
} from "../../types/CityProjectConfig.js";

/** 写入 wrangler.toml 的结果。 */
export interface WranglerConfigWriteResult {
  /** wrangler.toml 绝对路径。 */
  config_path: string;
}

/**
 * 根据 City 项目配置和本地部署环境写入临时 wrangler.toml。
 */
export function writeWranglerConfig(
  config_file: CityProjectConfigFile,
  env_file: CityProjectDeployEnvFile,
): WranglerConfigWriteResult {
  const config = config_file.config;
  const config_dir = mkdtempSync(join(tmpdir(), "downcity-wrangler-"));
  const config_path = join(config_dir, "wrangler.toml");
  const database_id = env_file.env.city_d1_database_id ?? "";

  const lines = [
    `name = ${tomlString(config.name)}`,
    `main = ${tomlString(resolve(config_file.project_dir, config.entry))}`,
    `compatibility_date = ${tomlString("2025-05-12")}`,
    `compatibility_flags = ${tomlArray(["nodejs_compat"])}`,
    "workers_dev = true",
  ];

  if (config.database) {
    lines.push(
      "",
      "[[d1_databases]]",
      `binding = ${tomlString(config.database.binding)}`,
      `database_name = ${tomlString(config.database.name)}`,
      `database_id = ${tomlString(database_id)}`,
    );
  }

  lines.push(
    "",
    "[observability]",
    "enabled = true",
  );

  writeFileSync(config_path, `${lines.join("\n")}\n`);
  return { config_path };
}

/**
 * 渲染 TOML 字符串。
 */
function tomlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * 渲染 TOML 字符串数组。
 */
function tomlArray(values: string[]): string {
  return `[${values.map(tomlString).join(", ")}]`;
}
