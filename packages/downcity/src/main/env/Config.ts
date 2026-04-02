/**
 * Env Config：环境与配置读取工具模块。
 *
 * 职责说明：
 * 1. 仅加载项目根目录 `.env`（用户自管文件，不写回 DB）。
 * 2. 读取 `downcity.json` 并将 `${ENV_KEY}` 占位符解析为环境变量值。
 * 3. 支持配置继承：（可选）上级目录 downcity.json -> 当前项目 downcity.json 覆盖。
 * 4. 环境变量分层：`env_entries` 单表承载 `global`（console 共享）与 `agent`（agent 私有）两种 scope。
 * 4. 统一导出 Downcity 配置类型，避免业务模块直接依赖具体配置文件路径。
 */
import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import type { DowncityConfig } from "@/types/DowncityConfig.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { ConsoleStore } from "@/utils/store/index.js";
import { assertProjectExecutionTarget } from "@/main/project/ProjectExecutionBinding.js";

export type { DowncityConfig };

/**
 * 读取 console 共享环境变量（`env_entries.scope=global`）。
 */
export function loadGlobalEnvFromStore(): Record<string, string> {
  const store = new ConsoleStore();
  try {
    return store.getGlobalEnvMapSync();
  } catch {
    return {};
  } finally {
    store.close();
  }
}

/**
 * 读取 agent 私有环境变量（`env_entries.scope=agent`）。
 */
export function loadAgentEnvFromStore(agentId: string): Record<string, string> {
  const normalizedAgentId = String(agentId || "").trim();
  if (!normalizedAgentId) return {};
  const store = new ConsoleStore();
  try {
    return store.getAgentEnvMapSync(normalizedAgentId);
  } catch {
    return {};
  } finally {
    store.close();
  }
}

/**
 * 读取 agent 最终环境变量快照。
 *
 * 关键点（中文）
 * - 来源：agent scope env（DB） + `<agent>/.env`（用户文件）。
 * - 冲突时 `.env` 优先，满足用户可在本地即时覆盖。
 */
export function loadAgentEnvSnapshot(projectRoot: string): Record<string, string> {
  const agentFromDb = loadAgentEnvFromStore(projectRoot);
  const projectDotenv = loadProjectDotenv(projectRoot);
  return {
    ...agentFromDb,
    ...projectDotenv,
  };
}

/**
 * 读取项目 `.env` 快照（不污染全局 process.env）。
 *
 * 关键点（中文）
 * - 只返回当前 agent 项目自己的 env 映射，供 runtime 局部使用。
 * - 不再把 agent env 注入全局，避免多个 agent 在同一 console 进程里互相污染。
 */
export function loadProjectDotenv(projectRoot: string): Record<string, string> {
  // 关键点（中文）
  // - console 级配置不再走 `~/.downcity/.env`（统一迁移到 downcity.db）
  // - 仅解析项目 `.env`（agent 级）
  const projectEnvPath = path.join(projectRoot, ".env");
  if (!fs.existsSync(projectEnvPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(projectEnvPath, "utf-8");
    const parsed = dotenv.parse(raw);
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = String(key || "").trim();
      if (!normalizedKey) continue;
      result[normalizedKey] = String(value || "").trim();
    }
    return result;
  } catch {
    return {};
  }
}

type ResolvedConfigValue =
  | JsonValue
  | undefined
  | { [key: string]: ResolvedConfigValue }
  | ResolvedConfigValue[];

function resolveEnvPlaceholdersDeep(
  value: ResolvedConfigValue,
  resolveEnvVar: (name: string) => string | undefined,
): ResolvedConfigValue {
  if (typeof value === "string") {
    const match = value.match(/^\$\{([A-Z0-9_]+)\}$/);
    if (!match) return value;
    const envVar = match[1];
    return resolveEnvVar(envVar);
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvPlaceholdersDeep(item, resolveEnvVar));
  }

  if (value && typeof value === "object") {
    const obj = value as JsonObject;
    const out: { [key: string]: ResolvedConfigValue } = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = resolveEnvPlaceholdersDeep(v as ResolvedConfigValue, resolveEnvVar);
    }
    return out;
  }

  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 深合并：对象递归合并，数组与标量以 override 为准。
 *
 * 关键点（中文）
 * - downcity.json 的“继承/覆盖”语义：越靠近 agent 项目的配置优先级越高。
 * - 数组不做 concat，避免出现重复 paths / models。
 */
function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }

  const out: Record<string, unknown> = { ...base };
  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = (base as Record<string, unknown>)[key];
    if (Array.isArray(overrideValue)) {
      out[key] = overrideValue;
      continue;
    }
    if (isPlainObject(overrideValue) && isPlainObject(baseValue)) {
      out[key] = deepMerge(baseValue, overrideValue);
      continue;
    }
    out[key] = overrideValue === undefined ? baseValue : overrideValue;
  }
  return out;
}

function readShipJsonLayer(
  filePath: string,
  resolveEnvVar: (name: string) => string | undefined,
): ResolvedConfigValue {
  const raw = fs.readJsonSync(filePath) as ResolvedConfigValue;
  return resolveEnvPlaceholdersDeep(raw, resolveEnvVar);
}

/**
 * 校验项目层是否误配废弃的 `extensions` 字段。
 *
 * 关键点（中文）
 * - 新版本统一使用 `plugins`。
 * - 发现旧字段时直接报错，避免继续沿用已删除方案。
 */
function assertNoProjectExtensionsLayer(
  filePath: string,
  layer: ResolvedConfigValue,
): void {
  if (!isPlainObject(layer)) return;
  if (!Object.prototype.hasOwnProperty.call(layer, "extensions")) return;
  throw new Error(
    `Invalid downcity.json: legacy "extensions" config is no longer supported. Use "plugins" instead (${filePath})`,
  );
}

function collectAncestorShipJsonPaths(projectRoot: string): string[] {
  const paths: string[] = [];
  const resolvedRoot = path.resolve(projectRoot);
  let dir = resolvedRoot;
  while (true) {
    const candidate = path.join(dir, "downcity.json");
    if (fs.existsSync(candidate)) paths.push(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // root -> leaf
  return paths.reverse();
}

export function loadDowncityConfig(
  projectRoot: string,
  options?: {
    projectEnv?: Record<string, string>;
    agentEnv?: Record<string, string>;
    globalEnv?: Record<string, string>;
  },
): DowncityConfig {
  const projectDotenv = options?.projectEnv ?? loadProjectDotenv(projectRoot);
  const agentEnv = options?.agentEnv ?? loadAgentEnvFromStore(projectRoot);
  const globalEnv = options?.globalEnv ?? loadGlobalEnvFromStore();
  const runtimeAgentEnv = {
    ...agentEnv,
    ...projectDotenv,
  };
  /**
   * 读取 agent 项目私有环境变量（services）。
   *
   * 关键点（中文）
   * - project 层只读当前项目 .env，不再回退到共享 env。
   * - 从根上杜绝跨 agent 的服务凭据串用。
   */
  const resolveProjectEnvVar = (name: string): string | undefined => {
    const projectValue = String(runtimeAgentEnv[name] || "").trim();
    return projectValue || undefined;
  };

  const ancestorShipJsonPaths = collectAncestorShipJsonPaths(projectRoot);
  if (ancestorShipJsonPaths.length === 0) {
    throw new Error("downcity.json not found in project directory");
  }

  let merged: unknown = undefined;
  for (const p of ancestorShipJsonPaths) {
    const layer = readShipJsonLayer(p, resolveProjectEnvVar);
    assertNoProjectExtensionsLayer(p, layer);
    merged = deepMerge(merged, layer);
  }

  if (!merged || typeof merged !== "object" || Array.isArray(merged)) {
    throw new Error("Invalid downcity.json: expected object");
  }

  const candidate = merged as Partial<DowncityConfig>;
  if (typeof candidate.name !== "string" || typeof candidate.version !== "string") {
    throw new Error("Invalid downcity.json: missing required fields name/version");
  }
  const config = candidate as DowncityConfig;
  assertProjectExecutionTarget(config);
  return config;
}
