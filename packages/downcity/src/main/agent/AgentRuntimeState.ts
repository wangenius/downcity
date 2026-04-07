/**
 * AgentRuntime 进程级状态读写模块。
 *
 * 关键点（中文）
 * - 这里统一维护当前进程中的 base / ready 两阶段状态。
 * - `AgentRuntimeBase` 只表示启动早期已经可用的基础配置；`AgentRuntime` 才表示完整运行态。
 * - 该模块只负责状态持有与读写，不负责装配具体依赖对象。
 */

import type { LanguageModel } from "ai";
import type {
  AgentRuntime,
  AgentRuntimeBase,
} from "@/types/agent/AgentRuntime.js";
import type { DowncityConfig } from "@/shared/types/DowncityConfig.js";
import type {
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/shared/types/AgentHost.js";
export type { AgentRuntime, AgentRuntimeBase } from "@/types/agent/AgentRuntime.js";

let baseState: AgentRuntimeBase | null = null;
let readyState: AgentRuntime | null = null;

const EMPTY_PATHS: AgentPathRuntime = {
  projectRoot: ".",
  getDowncityDirPath: () => ".downcity",
  getCacheDirPath: () => ".downcity/.cache",
  getDowncityChannelDirPath: () => ".downcity/channel",
  getDowncityChannelMetaPath: () => ".downcity/channel/meta.json",
  getDowncityChatHistoryPath: (sessionId) => `.downcity/chat/${sessionId}/history.jsonl`,
  getDowncityMemoryIndexPath: () => ".downcity/memory/index.sqlite",
  getDowncityMemoryLongTermPath: () => ".downcity/memory/MEMORY.md",
  getDowncityMemoryDailyDirPath: () => ".downcity/memory/daily",
  getDowncityMemoryDailyPath: (date) => `.downcity/memory/daily/${date}.md`,
  getDowncitySessionRootDirPath: () => ".downcity/session",
  getDowncitySessionDirPath: (sessionId) => `.downcity/session/${sessionId}`,
};

const EMPTY_PLUGIN_CONFIG: AgentPluginConfigRuntime = {
  async persistProjectPlugins() {
    return "";
  },
};

function normalizeReadyState(input: AgentRuntime): AgentRuntime {
  if (typeof input.getSession !== "function") {
    throw new Error("AgentRuntime requires getSession");
  }

  return {
    cwd: input.cwd,
    rootPath: input.rootPath,
    logger: input.logger,
    config: input.config,
    env: input.env,
    globalEnv: input.globalEnv,
    systems: input.systems,
    paths: input.paths || EMPTY_PATHS,
    pluginConfig: input.pluginConfig || EMPTY_PLUGIN_CONFIG,
    model: input.model,
    getSession: input.getSession,
    listExecutingSessionIds:
      input.listExecutingSessionIds || (() => []),
    getExecutingSessionCount:
      input.getExecutingSessionCount || (() => 0),
    services: input.services || new Map(),
  };
}

/**
 * 设置 agent 基础状态。
 */
export function setAgentRuntimeBase(next: AgentRuntimeBase): void {
  baseState = next;
  readyState = null;
}

/**
 * 设置完整 agent 状态。
 */
export function setAgentRuntime(next: AgentRuntime): void {
  const normalized = normalizeReadyState(next);
  baseState = normalized;
  readyState = normalized;
}

/**
 * 仅更新当前 agent 的项目配置快照。
 *
 * 关键点（中文）
 * - 运行中 agent 可能在不重启进程的情况下收到 downcity.json 变更。
 * - 这里仅替换 `config`，不重建 model / service / session 等长期对象。
 * - 目标是让 plugin 启用态、system 注入等直接依赖配置快照的能力及时生效。
 */
export function updateAgentRuntimeConfig(nextConfig: DowncityConfig): void {
  if (!baseState) {
    throw new Error(
      "Agent state is not initialized. Call initAgentRuntime() during startup.",
    );
  }

  baseState = {
    ...baseState,
    config: nextConfig,
  };

  if (readyState) {
    readyState = {
      ...readyState,
      config: nextConfig,
    };
  }
}

/**
 * 获取 agent 基础状态。
 */
export function getAgentRuntimeBase(): AgentRuntimeBase {
  if (baseState) return baseState;
  throw new Error(
    "Agent state (base) is not initialized. Call initAgentRuntime() during startup.",
  );
}

/**
 * 获取完整 agent 状态。
 */
export function getAgentRuntime(): AgentRuntime {
  if (readyState) return readyState;
  if (!baseState) {
    throw new Error(
      "Agent state is not initialized. Call initAgentRuntime() during startup.",
    );
  }
  throw new Error(
    "Agent state is not ready yet. Ensure session is initialized before access.",
  );
}

/**
 * 读取当前 agent 模型实例（必填）。
 */
export function requireAgentModel(): LanguageModel {
  if (readyState?.model) return readyState.model;
  throw new Error(
    "Agent model is not initialized. Ensure initAgentRuntime() completed successfully.",
  );
}
