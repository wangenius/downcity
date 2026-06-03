/**
 * Agent 项目配置读取与装配模块。
 *
 * 职责说明（中文）
 * - 统一负责读取 `downcity.json`、项目 `.env` 与宿主显式注入的基础 env。
 * - 负责把祖先目录中的多个 `downcity.json` 逐层合并成当前项目的最终配置。
 * - 负责在配置读取阶段完成最小结构校验。
 *
 * 边界说明（中文）
 * - 这里只做“配置文件 -> 运行时配置对象”的装配，不负责项目初始化写文件。
 * - 这里只校验配置是否满足 agent 运行最低要求，不负责平台模型是否真实可用。
 */
import dotenv from "dotenv";
import fs from "fs-extra";
import path from "path";
import type { DowncityConfig } from "@/types/config/DowncityConfig.js";
import { assertProjectExecutionTarget } from "@/config/ExecutionBinding.js";
import { deepMerge } from "@/utils/object/DeepMerge.js";
import { isPlainObject } from "@/utils/object/ObjectGuards.js";
import { collectAncestorNamedFilePaths } from "@/utils/path/AncestorFiles.js";

export type { DowncityConfig };

/**
 * 读取项目 `.env` 快照（不污染全局 process.env）。
 *
 * 关键点（中文）
 * - 只返回当前 agent 项目自己的 env 映射，供 runtime 局部使用。
 */
export function loadProjectDotenv(projectRoot: string): Record<string, string> {
  // 关键点（中文）
  // - 平台级配置不再走 `~/.downcity/.env`（统一迁移到 downcity.db）
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

/**
 * 解析当前 agent 最终用户环境变量。
 *
 * 关键点（中文）
 * - 合并顺序固定为：宿主显式 `env` < 项目 `.env`。
 * - `@downcity/agent` 不再自动读取当前进程 `process.env`。
 * - 这里返回的是“用户可感知”的最终 env，不包含 session/server 运行时元信息。
 */
export function resolveAgentEnv(
  projectRoot: string,
  hostEnv?: Record<string, string>,
): Record<string, string> {
  return {
    ...(hostEnv ? { ...hostEnv } : {}),
    ...loadProjectDotenv(projectRoot),
  };
}

/**
 * 读取单层 `downcity.json`。
 *
 * 关键点（中文）
 * - 单层读取不做字段语义校验，便于后续统一合并后再做最终断言。
 */
function readShipJsonLayer(filePath: string): unknown {
  return fs.readJsonSync(filePath) as unknown;
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
  layer: unknown,
): void {
  if (!isPlainObject(layer)) return;
  if (!Object.prototype.hasOwnProperty.call(layer, "extensions")) return;
  throw new Error(
    `Invalid downcity.json: legacy "extensions" config is no longer supported. Use "plugins" instead (${filePath})`,
  );
}

function normalizeDefaultAgentId(projectRoot: string): string {
  const basename = path.basename(projectRoot);
  return basename
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .trim() || basename || "agent";
}

/**
 * 加载当前项目最终生效的 `downcity.json` 配置。
 *
 * 关键点（中文）
 * - 读取顺序为“祖先目录 -> 当前项目目录”，后层配置覆盖前层配置。
 * - 返回前会断言最小执行目标，保证 agent 至少知道该如何执行。
 */
export function loadDowncityConfig(projectRoot: string): DowncityConfig {
  const ancestorShipJsonPaths = collectAncestorNamedFilePaths(
    projectRoot,
    "downcity.json",
  );
  if (ancestorShipJsonPaths.length === 0) {
    throw new Error("downcity.json not found in project directory");
  }

  let merged: unknown = undefined;
  for (const p of ancestorShipJsonPaths) {
    const layer = readShipJsonLayer(p);
    assertNoProjectExtensionsLayer(p, layer);
    merged = deepMerge(merged, layer);
  }

  if (!merged || typeof merged !== "object" || Array.isArray(merged)) {
    throw new Error("Invalid downcity.json: expected object");
  }

  const candidate = merged as Partial<DowncityConfig>;
  // 关键点（中文）：运行态 agent id 与 CLI resolveAgentId 保持一致，未显式配置时用目录名兜底。
  const config: DowncityConfig = {
    ...candidate,
    id: String(candidate.id || "").trim() || normalizeDefaultAgentId(projectRoot),
    version: String(candidate.version || "").trim() || "1.0.0",
  };
  assertProjectExecutionTarget(config);
  return config;
}
