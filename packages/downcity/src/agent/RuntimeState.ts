import type { LanguageModel } from "ai";
import type { Logger } from "@utils/logger/Logger.js";
import { SessionRegistry } from "@sessions/SessionRegistry.js";
import type { DowncityConfig } from "@/types/DowncityConfig.js";
import type { BaseService } from "@services/BaseService.js";

/**
 * Agent 宿主基础状态。
 *
 * 关键点（中文）
 * - 这是“宿主层稳定字段”，不含 session registry。
 * - 用于启动早期阶段先建立最小可读状态。
 */
export type AgentRuntimeBase = {
  /**
   * 当前命令工作目录。
   */
  cwd: string;
  /**
   * 当前 agent 工程根目录。
   */
  rootPath: string;
  /**
   * 当前统一日志器。
   */
  logger: Logger;
  /**
   * 当前解析后的项目配置。
   */
  config: DowncityConfig;
  /**
   * 当前 agent 的局部环境变量快照。
   */
  env: Record<string, string>;
  /**
   * 当前静态 system 文本集合。
   */
  systems: string[];
};

/**
 * Agent 完整宿主状态。
 *
 * 关键点（中文）
 * - ready 后才会带上 session registry。
 * - 对外部来说，这才是“可执行”的 agent 宿主态。
 */
export type AgentRuntime = AgentRuntimeBase & {
  /**
   * 当前 agent 持有的 session registry。
   */
  sessionRegistry: SessionRegistry;
  /**
   * 当前 agent 持有的 service instances。
   *
   * 关键点（中文）
   * - 这是 per-agent 的 service 实例集合。
   * - 第一阶段内部仍可能包一层 legacy adapter，但实例所有权已经归 agent。
   */
  services: Map<string, BaseService>;
};

let baseState: AgentRuntimeBase | null = null;
let readyState: AgentRuntime | null = null;
let executionModel: LanguageModel | null = null;

/**
 * 设置宿主基础状态。
 *
 * 关键点（中文）
 * - 每次覆盖 base 时都要清空 ready，避免读取到旧对象。
 */
export function setAgentRuntimeBase(next: AgentRuntimeBase): void {
  baseState = next;
  readyState = null;
}

/**
 * 设置完整宿主状态。
 */
export function setAgentRuntime(next: AgentRuntime): void {
  baseState = next;
  readyState = next;
}

/**
 * 获取宿主基础状态。
 */
export function getAgentRuntimeBase(): AgentRuntimeBase {
  if (baseState) return baseState;
  throw new Error(
    "Runtime state (base) is not initialized. Call initAgentRuntime() during startup.",
  );
}

/**
 * 获取完整宿主状态。
 */
export function getAgentRuntime(): AgentRuntime {
  if (readyState) return readyState;
  if (!baseState) {
    throw new Error(
      "Runtime state is not initialized. Call initAgentRuntime() during startup.",
    );
  }
  throw new Error(
    "Runtime state is not ready yet. Ensure SessionRegistry is initialized before access.",
  );
}

/**
 * 设置统一执行模型实例。
 */
export function setExecutionModel(model: LanguageModel | null): void {
  executionModel = model;
}

/**
 * 读取统一执行模型实例（必填）。
 *
 * 关键点（中文）
 * - `runtime.session.model` 依赖这里。
 * - 若缺失说明启动链路不完整，应 fail-fast。
 */
export function requireExecutionModel(): LanguageModel {
  if (executionModel) return executionModel;
  throw new Error(
    "Execution runtime model is not initialized. Ensure initAgentRuntime() completed successfully.",
  );
}
