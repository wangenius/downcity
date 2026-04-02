import type { LanguageModel } from "ai";
import type {
  AgentPluginRegistry,
  AgentState,
  AgentStateBase,
} from "@/types/AgentState.js";
export type { AgentState, AgentStateBase } from "@/types/AgentState.js";

/**
 * AgentState 进程级状态读写模块。
 *
 * 关键点（中文）
 * - 这里统一维护当前进程中的 base / ready 两阶段状态。
 * - `AgentState` 才是完整运行态；`AgentStateBase` 只用于启动早期。
 */

function createNoopPluginRegistry(): AgentPluginRegistry {
  return {
    list() {
      return [];
    },
    async availability() {
      return {
        enabled: false,
        available: false,
        reasons: ["Plugin registry is not initialized"],
      };
    },
    async runAction(params: { plugin: string; action: string }) {
      return {
        success: false,
        error: `Plugin registry is not initialized: ${params.plugin}.${params.action}`,
        message: `Plugin registry is not initialized: ${params.plugin}.${params.action}`,
      };
    },
    async pipeline<T>(_: string, value: T): Promise<T> {
      return value;
    },
    async guard<T>(_: string, _value: T): Promise<void> {
      return;
    },
    async effect<T>(_: string, _value: T): Promise<void> {
      return;
    },
    async resolve<TInput, TOutput>(_: string, value: TInput): Promise<TOutput> {
      return value as unknown as TOutput;
    },
  };
}

let baseState: AgentStateBase | null = null;
let readyState: AgentState | null = null;

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
    systems: input.systems,
    model: input.model,
    sessionStore: input.sessionStore,
    services: input.services || new Map(),
    pluginRegistry: input.pluginRegistry || createNoopPluginRegistry(),
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
