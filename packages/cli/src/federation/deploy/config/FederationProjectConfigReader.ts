/**
 * City 项目配置读取器。
 *
 * 关键点（中文）
 * - `federation.json` 保存可提交的部署意图：type、name、target、entry、resources。
 * - Cloudflare account、D1 id、Worker URL 等部署状态不进入项目配置。
 * - 部署状态不写回 `federation.json`，避免用户手写协议被机器污染。
 */

import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { CliError } from "@/shared/CliError.js";
import type {
  FederationProjectConfig,
  FederationProjectConfigFile,
  FederationProjectD1ResourceConfig,
  FederationProjectQueueResourceConfig,
  FederationProjectResourcesConfig,
} from "@/federation/types/FederationProjectConfig.js";

const FEDERATION_CONFIG_FILE_NAME = "federation.json";

/**
 * 读取指定目录下的 City 项目配置。
 */
export function readFederationProjectConfig(dir: string): FederationProjectConfigFile {
  const project_dir = resolve(String(dir || "."));
  const config_path = join(project_dir, FEDERATION_CONFIG_FILE_NAME);
  if (!existsSync(config_path)) {
    throw new CliError({
      title: "City project config not found",
      note: `Expected ${config_path}`,
      fix: "Create federation.json in the City project, then run city deploy.",
    });
  }

  let raw_config: unknown;
  try {
    raw_config = JSON.parse(readFileSync(config_path, "utf-8"));
  } catch (error) {
    throw new CliError({
      title: "Invalid federation.json",
      note: error instanceof Error ? error.message : String(error),
      fix: "Check that federation.json is valid JSON.",
    });
  }

  return {
    project_dir,
    config_path,
    config: normalizeFederationProjectConfig(raw_config, config_path, project_dir),
  };
}

/**
 * 补齐并校验 City 项目配置。
 */
function normalizeFederationProjectConfig(
  input: unknown,
  config_path: string,
  project_dir: string,
): FederationProjectConfig {
  if (!isRecord(input)) {
    throw invalidConfig(config_path, "Root value must be an object.");
  }

  const type = readOptionalString(input, "type") ?? "city";
  if (type !== "city") {
    throw invalidConfig(config_path, `Unsupported type: ${type}`);
  }

  const schema = readOptionalNumber(input, "schema") ?? 1;
  if (schema !== 1) {
    throw invalidConfig(config_path, `Unsupported schema: ${schema}`);
  }

  const name = readOptionalString(input, "name") ?? inferProjectName(project_dir);
  const target = readOptionalString(input, "target")
    ?? readOptionalString(input, "runtime")
    ?? "cloudflare-workers";
  if (target !== "cloudflare-workers") {
    throw invalidConfig(config_path, `Unsupported target: ${target}`);
  }
  const entry = readOptionalString(input, "entry") ?? resolveTargetEntry(target);

  return {
    schema,
    type,
    name,
    entry,
    target,
    resources: resolveProjectResources(input, target, name),
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
function resolveTargetD1Resource(
  target: string,
  project_name: string,
): FederationProjectD1ResourceConfig | undefined {
  if (target !== "cloudflare-workers") return undefined;
  return {
    type: "d1",
    binding: "DB",
    name: `${project_name}-db`,
  };
}

/**
 * 解析 target 的默认 Queue。
 */
function resolveTargetQueueResource(
  target: string,
  project_name: string,
): FederationProjectQueueResourceConfig | undefined {
  if (target !== "cloudflare-workers") return undefined;
  return {
    type: "queue",
    binding: "DOWNCITY_QUEUE",
    name: `${project_name}-queue`,
  };
}

/**
 * 解析项目资源配置。
 */
function resolveProjectResources(
  input: Record<string, unknown>,
  target: string,
  project_name: string,
): FederationProjectResourcesConfig {
  const default_d1 = resolveTargetD1Resource(target, project_name);
  const default_queue = resolveTargetQueueResource(target, project_name);
  const resources = readOptionalRecord(input, "resources");
  const d1 = readOptionalRecord(resources ?? {}, "d1");
  const queue = readOptionalRecord(resources ?? {}, "queue");
  const legacy_database = readOptionalRecord(input, "database");
  const d1_source = d1 ?? legacy_database;

  if (!default_d1) return {};

  return {
    d1: d1_source
      ? {
          type: "d1",
          binding: readOptionalString(d1_source, "binding") ?? default_d1.binding,
          name: readOptionalString(d1_source, "name") ?? default_d1.name,
        }
      : default_d1,
    ...(default_queue
      ? {
          queue: queue
            ? {
                type: "queue" as const,
                binding: readOptionalString(queue, "binding") ?? default_queue.binding,
                name: readOptionalString(queue, "name") ?? default_queue.name,
              }
            : default_queue,
        }
      : {}),
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
    title: "Invalid federation.json",
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

/**
 * 读取可选数字。
 */
function readOptionalNumber(
  input: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = input[key];
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  return value;
}

/**
 * 读取可选对象。
 */
function readOptionalRecord(
  input: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = input[key];
  if (!isRecord(value)) return undefined;
  return value;
}
