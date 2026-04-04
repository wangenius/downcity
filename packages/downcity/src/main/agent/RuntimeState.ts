/**
 * AgentState 进程级状态读写模块。
 *
 * 关键点（中文）
 * - 这里统一维护当前进程中的 base / ready 两阶段状态。
 * - `AgentStateBase` 只表示启动早期已经可用的基础配置；`AgentState` 才表示完整运行态。
 * - 该模块只负责状态持有与读写，不负责装配具体依赖对象。
 */

import type { LanguageModel } from "ai";
import type {
  AgentState,
  AgentStateBase,
} from "@/shared/types/AgentState.js";
import type {
  AgentAuthRuntime,
  AgentPathRuntime,
  AgentPluginConfigRuntime,
} from "@/shared/types/AgentHost.js";
export type { AgentState, AgentStateBase } from "@/shared/types/AgentState.js";

let baseState: AgentStateBase | null = null;
let readyState: AgentState | null = null;

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

const EMPTY_AUTH: AgentAuthRuntime = {
  applyInternalAgentAuthEnv() {},
};

const EMPTY_PLUGIN_CONFIG: AgentPluginConfigRuntime = {
  async persistProjectPlugins() {
    return "";
  },
};

function normalizeReadyState(input: AgentState): AgentState {
  if (!input.sessionStore) {
    throw new Error("AgentState requires sessionStore");
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
    auth: input.auth || EMPTY_AUTH,
    pluginConfig: input.pluginConfig || EMPTY_PLUGIN_CONFIG,
    model: input.model,
    sessionStore: input.sessionStore,
    services: input.services || new Map(),
  };
}

/**
 * 设置 agent 基础状态。
 */
export function setAgentStateBase(next: AgentStateBase): void {
  baseState = next;
  readyState = null;
}

/**
 * 设置完整 agent 状态。
 */
export function setAgentState(next: AgentState): void {
  const normalized = normalizeReadyState(next);
  baseState = normalized;
  readyState = normalized;
}

/**
 * 获取 agent 基础状态。
 */
export function getAgentStateBase(): AgentStateBase {
  if (baseState) return baseState;
  throw new Error(
    "Agent state (base) is not initialized. Call initAgentState() during startup.",
  );
}

/**
 * 获取完整 agent 状态。
 */
export function getAgentState(): AgentState {
  if (readyState) return readyState;
  if (!baseState) {
    throw new Error(
      "Agent state is not initialized. Call initAgentState() during startup.",
    );
  }
  throw new Error(
    "Agent state is not ready yet. Ensure session store is initialized before access.",
  );
}

/**
 * 读取当前 agent 模型实例（必填）。
 */
export function requireAgentModel(): LanguageModel {
  if (readyState?.model) return readyState.model;
  throw new Error(
    "Agent model is not initialized. Ensure initAgentState() completed successfully.",
  );
}
