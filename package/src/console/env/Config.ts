/**
 * Env Config：环境与配置读取工具模块。
 *
 * 职责说明：
 * 1. 先加载 console（`~/.ship/.env`）的全局环境变量，再加载项目根目录 `.env` 覆盖同名键。
 * 2. 读取 `ship.json` 并将 `${ENV_KEY}` 占位符解析为环境变量值。
 * 3. 支持 `ship.json` 继承：console ->（可选）上级目录 ship.json -> 当前项目 ship.json 覆盖。
 * 4. 统一导出 Ship 配置类型，避免业务模块直接依赖具体配置文件路径。
 */
import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import type { ShipConfig } from "@agent/types/ShipConfig.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { getConsoleDotenvPath, getConsoleShipJsonPath } from "@/console/runtime/ConsolePaths.js";

export type { ShipConfig };

export function loadProjectDotenv(projectRoot: string): void {
  // 关键点（中文）
  // - 先加载 console 的全局环境变量（不覆盖已有 env）
  // - 再加载项目 `.env`，允许覆盖 console 的同名键（agent 优先）
  const operationEnvPath = getConsoleDotenvPath();
  if (fs.existsSync(operationEnvPath)) {
    dotenv.config({ path: operationEnvPath, override: false });
  }

  const projectEnvPath = path.join(projectRoot, ".env");
  if (fs.existsSync(projectEnvPath)) {
    dotenv.config({ path: projectEnvPath, override: true });
  }
}

type ResolvedConfigValue =
  | JsonValue
  | undefined
  | { [key: string]: ResolvedConfigValue }
  | ResolvedConfigValue[];

function resolveEnvPlaceholdersDeep(value: ResolvedConfigValue): ResolvedConfigValue {
  if (typeof value === "string") {
    const match = value.match(/^\$\{([A-Z0-9_]+)\}$/);
    if (!match) return value;
    const envVar = match[1];
    return process.env[envVar];
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvPlaceholdersDeep(item));
  }

  if (value && typeof value === "object") {
    const obj = value as JsonObject;
    const out: { [key: string]: ResolvedConfigValue } = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = resolveEnvPlaceholdersDeep(v as ResolvedConfigValue);
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

function readShipJsonLayer(filePath: string): ResolvedConfigValue {
  const raw = fs.readJsonSync(filePath) as ResolvedConfigValue;
  return resolveEnvPlaceholdersDeep(raw);
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

export function loadShipConfig(projectRoot: string): ShipConfig {
  loadProjectDotenv(projectRoot);

  const operationShipJsonPath = getConsoleShipJsonPath();
  const operationLayer = fs.existsSync(operationShipJsonPath)
    ? readShipJsonLayer(operationShipJsonPath)
    : undefined;

  const ancestorShipJsonPaths = collectAncestorShipJsonPaths(projectRoot).filter(
    (p) => path.resolve(p) !== path.resolve(operationShipJsonPath),
  );
  if (ancestorShipJsonPaths.length === 0) {
    throw new Error("ship.json not found in project directory");
  }

  let merged: unknown = operationLayer;
  for (const p of ancestorShipJsonPaths) {
    const layer = readShipJsonLayer(p);
    merged = deepMerge(merged, layer);
  }

  if (!merged || typeof merged !== "object" || Array.isArray(merged)) {
    throw new Error("Invalid ship.json: expected object");
  }

  const candidate = merged as Partial<ShipConfig>;
  if (typeof candidate.name !== "string" || typeof candidate.version !== "string") {
    throw new Error("Invalid ship.json: missing required fields name/version");
  }
  if (!candidate.llm || typeof candidate.llm !== "object") {
    throw new Error(
      'Invalid ship.json: missing required field llm (run "sma init" to create ~/.ship/ship.json)',
    );
  }

  return candidate as ShipConfig;
}
