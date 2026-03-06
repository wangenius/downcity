/**
 * OrchestratorComponent：本轮运行编排组件抽象。
 *
 * 关键点（中文）
 * - 统一编排 requestId/tools/onStepCallback。
 * - system 解析由 SystemerComponent 专职负责。
 */

import type { Tool } from "ai";
import type { ShipContextUserMessageV1 } from "@main/types/ContextMessage.js";
import { AgentComponent } from "./AgentComponent.js";

/**
 * 本轮运行编排输入。
 */
export type OrchestratorComposeInput = {
  /**
   * 当前会话 ID。
   */
  contextId: string;
};

/**
 * 本轮运行编排输出。
 */
export type OrchestratorComposeResult = {
  /**
   * 请求链路 ID。
   */
  requestId: string;

  /**
   * 本轮工具集合。
   */
  tools: Record<string, Tool>;

  /**
   * 可选 step 边界合并回调。
   */
  onStepCallback?: () => Promise<ShipContextUserMessageV1[]>;
};

/**
 * Orchestrator 组件抽象类。
 */
export abstract class OrchestratorComponent extends AgentComponent {
  /**
   * 组件名（由具体实现声明）。
   */
  abstract readonly name: string;

  /**
   * 组装一次 run 所需上下文。
   */
  abstract compose(
    input: OrchestratorComposeInput,
  ): Promise<OrchestratorComposeResult>;

  /**
   * 可选初始化钩子。
   */
  // 生命周期沿用 AgentComponent 默认实现。
}
