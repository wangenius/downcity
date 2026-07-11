/**
 * AgentConfigStore：CLI 全局 DB 中的 Agent 配置仓储。
 *
 * 关键点（中文）
 * - Agent 管理态只写入全局数据库。
 * - 全局 DB 以 projectRoot 为主键保存 agent id、启动参数、execution 与 plugin usage 配置。
 * - 项目目录不再承载配置文件，所有管理态配置只从全局 DB 读取。
 */

import path from "node:path";
import { withPlatformStore } from "@/city/runtime/store/index.js";
import {
  get_agent_config_row,
  list_agent_config_rows,
  migrate_agent_config_rows,
  remove_agent_config_row,
  set_agent_config_row,
} from "@/city/runtime/store/StoreAgentConfigRepository.js";
import { normalizeDefaultAgentId } from "@downcity/agent";
import type {
  StoredAgentConfig,
} from "@/city/types/AgentConfig.js";
export type { StoredAgentConfig } from "@/city/types/AgentConfig.js";

const CITY_AGENT_CONFIGS_KEY = "city.agent.configs";

function now_iso(): string {
  return new Date().toISOString();
}

function normalize_project_root(projectRoot: string): string {
  const resolved = path.resolve(String(projectRoot || "").trim() || ".");
  if (!resolved) throw new Error("projectRoot is required");
  return resolved;
}

function default_agent_id(projectRoot: string): string {
  const baseName = path.basename(projectRoot);
  return normalizeDefaultAgentId(baseName) || baseName || "agent";
}

function normalize_config(
  input: Partial<StoredAgentConfig>,
  fallbackProjectRoot?: string,
): StoredAgentConfig {
  const projectRoot = normalize_project_root(
    input.projectRoot || fallbackProjectRoot || ".",
  );
  const currentTime = now_iso();
  return {
    projectRoot,
    id: String(input.id || "").trim() || default_agent_id(projectRoot),
    version: String(input.version || "").trim() || "1.0.0",
    ...(input.start ? { start: input.start } : {}),
    ...(input.execution ? { execution: input.execution } : {}),
    ...(input.plugins ? { plugins: input.plugins } : {}),
    ...(input.llm ? { llm: input.llm } : {}),
    createdAt: String(input.createdAt || "").trim() || currentTime,
    updatedAt: String(input.updatedAt || "").trim() || currentTime,
  };
}

/**
 * 读取指定项目的 Agent 配置。
 */
export function readAgentConfig(projectRootInput: string): StoredAgentConfig | null {
  const projectRoot = normalize_project_root(projectRootInput);
  return withPlatformStore((context) => {
    migrate_agent_config_rows(context, CITY_AGENT_CONFIGS_KEY);
    const stored = get_agent_config_row(context, projectRoot);
    return stored ? normalize_config(stored, projectRoot) : null;
  });
}

/**
 * 列出全部 Agent 配置。
 */
export function listAgentConfigs(): StoredAgentConfig[] {
  return withPlatformStore((context) => {
    migrate_agent_config_rows(context, CITY_AGENT_CONFIGS_KEY);
    return list_agent_config_rows(context)
      .map((item) => normalize_config(item))
      .sort((left, right) => left.projectRoot.localeCompare(right.projectRoot));
  });
}

/**
 * 新增或更新 Agent 配置。
 */
export function upsertAgentConfig(input: Partial<StoredAgentConfig> & {
  projectRoot: string;
}): StoredAgentConfig {
  const projectRoot = normalize_project_root(input.projectRoot);
  return withPlatformStore((context) => {
    migrate_agent_config_rows(context, CITY_AGENT_CONFIGS_KEY);
    const write_config = context.sqlite.transaction(() => {
      const existing = get_agent_config_row(context, projectRoot);
      const next_config = normalize_config({
        ...(existing || {}),
        ...input,
        projectRoot,
        createdAt: existing?.createdAt || input.createdAt,
        updatedAt: now_iso(),
      });
      set_agent_config_row(context, next_config);
      return next_config;
    });
    return write_config.immediate();
  });
}

/**
 * 删除 Agent 配置。
 */
export function removeAgentConfig(projectRootInput: string): void {
  const projectRoot = normalize_project_root(projectRootInput);
  withPlatformStore((context) => {
    migrate_agent_config_rows(context, CITY_AGENT_CONFIGS_KEY);
    remove_agent_config_row(context, projectRoot);
  });
}
