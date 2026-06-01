/**
 * City 项目配置读取器。
 *
 * 关键点（中文）
 * - `city.json` 保持极简：type、name、target。
 * - Cloudflare 细节由 CLI 默认处理，不要求开发者写一大段配置。
 * - 部署状态不写回 `city.json`，避免用户手写协议被机器污染。
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CliError } from "../../shared/CliError.js";
import type {
  CityProjectConfig,
  CityProjectConfigFile,
  CityProjectDatabaseConfig,
} from "../../types/CityProjectConfig.js";

const CITY_CONFIG_FILE_NAME = "city.json";

/**
 * 读取指定目录下的 City 项目配置。
 */
export function readCityProjectConfig(dir: string): CityProjectConfigFile {
  const project_dir = resolve(String(dir || "."));
  const config_path = join(project_dir, CITY_CONFIG_FILE_NAME);
  if (!existsSync(config_path)) {
    throw new CliError({
      title: "City project config not found",
      note: `Expected ${config_path}`,
      fix: "Create city.json in the City project, then run city deploy.",
    });
  }

  let raw_config: unknown;
  try {
    raw_config = JSON.parse(readFileSync(config_path, "utf-8"));
  } catch (error) {
    throw new CliError({
      title: "Invalid city.json",
      note: error instanceof Error ? error.message : String(error),
      fix: "Check that city.json is valid JSON.",
    });
  }

  return {
    project_dir,
    config_path,
    config: normalizeCityProjectConfig(raw_config, config_path, project_dir),
  };
}

/**
 * 补齐并校验 City 项目配置。
 */
function normalizeCityProjectConfig(
  input: unknown,
  config_path: string,
  project_dir: string,
): CityProjectConfig {
  if (!isRecord(input)) {
    throw invalidConfig(config_path, "Root value must be an object.");
  }

  const type = readOptionalString(input, "type") ?? "city";
  if (type !== "city") {
    throw invalidConfig(config_path, `Unsupported type: ${type}`);
  }

  const name = readOptionalString(input, "name") ?? inferProjectName(project_dir);
  const target = readOptionalString(input, "target")
    ?? readOptionalString(input, "runtime")
    ?? "cloudflare-workers";
  if (target !== "cloudflare-workers") {
    throw invalidConfig(config_path, `Unsupported target: ${target}`);
  }

  return {
    type,
    name,
    entry: resolveTargetEntry(target),
    target,
    database: resolveTargetDatabase(target, name),
  };
}

/**
 * 解析 target 的默认入口。
 */
function resolveTargetEntry(target: string): string {
  if (target === "cloudflare-workers") return "src/index.ts";
  return "src/index.ts";
}

/**
 * 解析 target 的默认数据库。
 */
function resolveTargetDatabase(
  target: string,
  project_name: string,
): CityProjectDatabaseConfig | undefined {
  if (target !== "cloudflare-workers") return undefined;
  return {
    type: "d1",
    binding: "DB",
    name: `${project_name}-db`,
  };
}

/**
 * 根据目录名推断项目名。
 */
function inferProjectName(project_dir: string): string {
  return basename(project_dir)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    || "city";
}

/**
 * 创建配置错误。
 */
function invalidConfig(config_path: string, note: string): CliError {
  return new CliError({
    title: "Invalid city.json",
    note: `${config_path}: ${note}`,
    fix: "Use a minimal shape like { \"type\": \"city\", \"name\": \"my-city\", \"target\": \"cloudflare-workers\" }.",
  });
}

/**
 * 判断值是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/**
 * 读取可选字符串。
 */
function readOptionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}
