/**
 * AgentConfigStore：CLI 全局 DB 中的 Agent 配置仓储。
 *
 * 关键点（中文）
 * - Agent 管理态不再写入项目 `downcity.json`。
 * - 全局 DB 以 projectRoot 为主键保存 agent id、启动参数、execution 与 plugin usage 配置。
 * - 旧 `downcity.json` 仅作为迁移来源读取一次，后续新写入都进入 DB。
 */

import fs from "fs-extra";
import path from "node:path";
import type { DowncityConfig } from "@downcity/agent";
import { createCityPlatformStore } from "@/city/runtime/store/index.js";
import { getDowncityJsonPath } from "@/city/config/Paths.js";
import { normalizeDefaultAgentId } from "@downcity/agent";
import type {
  AgentConfigsState,
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

function normalize_state(value: Partial<AgentConfigsState> | null | undefined): AgentConfigsState {
  if (!value || typeof value !== "object") {
    return {
      v: 1,
      configs: [],
    };
  }
  const configs = Array.isArray(value.configs)
    ? value.configs.map((item) => normalize_config(item))
    : [];
  const byProjectRoot = new Map<string, StoredAgentConfig>();
  for (const config of configs) {
    byProjectRoot.set(config.projectRoot, config);
  }
  return {
    v: 1,
    configs: [...byProjectRoot.values()].sort((left, right) =>
      left.projectRoot.localeCompare(right.projectRoot),
    ),
  };
}

function read_state(): AgentConfigsState {
  const store = createCityPlatformStore();
  try {
    return normalize_state(
      store.getSecureSettingJsonSync<AgentConfigsState>(CITY_AGENT_CONFIGS_KEY),
    );
  } finally {
    store.close();
  }
}

function write_state(state: AgentConfigsState): void {
  const store = createCityPlatformStore();
  try {
    store.setSecureSettingJsonSync(CITY_AGENT_CONFIGS_KEY, normalize_state(state));
  } finally {
    store.close();
  }
}

function read_legacy_downcity_config(projectRoot: string): StoredAgentConfig | null {
  const downcityJsonPath = getDowncityJsonPath(projectRoot);
  if (!fs.existsSync(downcityJsonPath)) return null;
  try {
    const raw = fs.readJsonSync(downcityJsonPath) as Partial<DowncityConfig>;
    return normalize_config(
      {
        projectRoot,
        id: raw.id,
        version: raw.version,
        start: raw.start,
        execution: raw.execution,
        plugins: raw.plugins,
        llm: raw.llm,
      },
      projectRoot,
    );
  } catch {
    return null;
  }
}

/**
 * 读取指定项目的 Agent 配置。
 */
export function readAgentConfig(projectRootInput: string): StoredAgentConfig | null {
  const projectRoot = normalize_project_root(projectRootInput);
  const state = read_state();
  const stored = state.configs.find((item) => item.projectRoot === projectRoot);
  if (stored) return normalize_config(stored, projectRoot);

  const legacy = read_legacy_downcity_config(projectRoot);
  if (!legacy) return null;

  upsertAgentConfig(legacy);
  return legacy;
}

/**
 * 列出全部 Agent 配置。
 */
export function listAgentConfigs(): StoredAgentConfig[] {
  return read_state().configs.map((item) => normalize_config(item));
}

/**
 * 新增或更新 Agent 配置。
 */
export function upsertAgentConfig(input: Partial<StoredAgentConfig> & {
  projectRoot: string;
}): StoredAgentConfig {
  const nextConfig = normalize_config({
    ...input,
    updatedAt: now_iso(),
  });
  const state = read_state();
  const existing = state.configs.find(
    (item) => item.projectRoot === nextConfig.projectRoot,
  );
  if (existing) {
    nextConfig.createdAt = existing.createdAt;
  }
  const nextState: AgentConfigsState = {
    v: 1,
    configs: [
      ...state.configs.filter((item) => item.projectRoot !== nextConfig.projectRoot),
      nextConfig,
    ],
  };
  write_state(nextState);
  return nextConfig;
}

/**
 * 删除 Agent 配置。
 */
export function removeAgentConfig(projectRootInput: string): void {
  const projectRoot = normalize_project_root(projectRootInput);
  const state = read_state();
  write_state({
    v: 1,
    configs: state.configs.filter((item) => item.projectRoot !== projectRoot),
  });
}
