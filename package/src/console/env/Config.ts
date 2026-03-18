/**
 * Env Config：环境与配置读取工具模块。
 *
 * 职责说明：
 * 1. 仅加载项目根目录 `.env`（console 级配置已迁移到 `~/.ship/ship.db`）。
 * 2. 读取 `ship.json` 并将 `${ENV_KEY}` 占位符解析为环境变量值。
 * 3. 支持配置继承：console(db 共享层) ->（可选）上级目录 ship.json -> 当前项目 ship.json 覆盖。
 * 4. 统一导出 Ship 配置类型，避免业务模块直接依赖具体配置文件路径。
 */
import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { ConsoleStore } from "@/utils/store/index.js";

export type { ShipConfig };

/**
 * 读取项目 `.env` 快照（不污染全局 process.env）。
 *
 * 关键点（中文）
 * - 只返回当前 agent 项目自己的 env 映射，供 runtime 局部使用。
 * - 不再把 agent env 注入全局，避免多个 agent 在同一 console 进程里互相污染。
 */
export function loadProjectDotenv(projectRoot: string): Record<string, string> {
  // 关键点（中文）
  // - console 级配置不再走 `~/.ship/.env`（统一迁移到 ship.db）
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
 * - ship.json 的“继承/覆盖”语义：越靠近 agent 项目的配置优先级越高。
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

function readConsoleConfigLayerFromStore(
  resolveEnvVar: (name: string) => string | undefined,
): ResolvedConfigValue {
  let store: ConsoleStore | null = null;
  try {
    store = new ConsoleStore();
    const raw = store.getSecureSettingJsonSync<unknown>("console_config");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    return resolveEnvPlaceholdersDeep(raw as ResolvedConfigValue, resolveEnvVar);
  } catch {
    return undefined;
  } finally {
    store?.close();
  }
}

/**
 * 提取 console 全局共享层（仅允许共享能力字段）。
 *
 * 关键点（中文）
 * - 只把 `extensions` 注入到 agent 运行时配置。
 * - `services.*`、`model.*` 等项目语义字段不允许来自 console 全局层。
 */
function pickConsoleSharedLayer(layer: ResolvedConfigValue): ResolvedConfigValue {
  if (!isPlainObject(layer)) return undefined;
  const shared: { [key: string]: ResolvedConfigValue } = {};
  if (Object.prototype.hasOwnProperty.call(layer, "extensions")) {
    shared.extensions = (layer as { extensions?: ResolvedConfigValue }).extensions;
  }
  return shared;
}

/**
 * 校验项目层是否误配 extensions。
 *
 * 关键点（中文）
 * - `extensions` 统一由 console 全局层（`~/.ship/ship.db`）管理。
 * - agent 项目 `ship.json` 只允许配置绑定与项目级参数，不允许写 `extensions`。
 */
function assertNoProjectExtensionsLayer(
  filePath: string,
  layer: ResolvedConfigValue,
): void {
  if (!isPlainObject(layer)) return;
  if (!Object.prototype.hasOwnProperty.call(layer, "extensions")) return;
  throw new Error(
    `Invalid ship.json: extensions must be configured in console ~/.ship/ship.db, not project file (${filePath})`,
  );
}

function collectAncestorShipJsonPaths(projectRoot: string): string[] {
  const paths: string[] = [];
  const resolvedRoot = path.resolve(projectRoot);
  let dir = resolvedRoot;
  while (true) {
    const candidate = path.join(dir, "ship.json");
    if (fs.existsSync(candidate)) paths.push(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // root -> leaf
  return paths.reverse();
}

export function loadShipConfig(
  projectRoot: string,
  options?: {
    projectEnv?: Record<string, string>;
    sharedEnv?: NodeJS.ProcessEnv;
  },
): ShipConfig {
  const projectEnv = options?.projectEnv ?? loadProjectDotenv(projectRoot);
  const sharedEnv = options?.sharedEnv ?? process.env;
  /**
   * 读取 console 共享环境变量（模型池 / extensions）。
   *
   * 关键点（中文）
   * - console 层只读共享 env，不读项目 .env。
   * - 避免某个 agent 项目的 .env 反向污染 console 全局配置解析。
   */
  const resolveSharedEnvVar = (name: string): string | undefined => {
    const sharedValue = String(sharedEnv[name] || "").trim();
    return sharedValue || undefined;
  };
  /**
   * 读取 agent 项目私有环境变量（services）。
   *
   * 关键点（中文）
   * - project 层只读当前项目 .env，不再回退到共享 env。
   * - 从根上杜绝跨 agent 的服务凭据串用。
   */
  const resolveProjectEnvVar = (name: string): string | undefined => {
    const projectValue = String(projectEnv[name] || "").trim();
    return projectValue || undefined;
  };

  const operationLayerRaw = readConsoleConfigLayerFromStore(resolveSharedEnvVar);
  const operationLayer = pickConsoleSharedLayer(operationLayerRaw);

  const ancestorShipJsonPaths = collectAncestorShipJsonPaths(projectRoot);
  if (ancestorShipJsonPaths.length === 0) {
    throw new Error("ship.json not found in project directory");
  }

  let merged: unknown = operationLayer;
  for (const p of ancestorShipJsonPaths) {
    const layer = readShipJsonLayer(p, resolveProjectEnvVar);
    assertNoProjectExtensionsLayer(p, layer);
    merged = deepMerge(merged, layer);
  }

  if (!merged || typeof merged !== "object" || Array.isArray(merged)) {
    throw new Error("Invalid ship.json: expected object");
  }

  const candidate = merged as Partial<ShipConfig>;
  if (typeof candidate.name !== "string" || typeof candidate.version !== "string") {
    throw new Error("Invalid ship.json: missing required fields name/version");
  }
  if (!candidate.model || typeof candidate.model !== "object") {
    throw new Error(
      'Invalid ship.json: missing required field model.primary in project ship.json (run "sma agent create" to regenerate)',
    );
  }
  const primary = String((candidate.model as { primary?: unknown }).primary || "").trim();
  if (!primary) {
    throw new Error("Invalid ship.json: model.primary cannot be empty");
  }
  return candidate as ShipConfig;
}
