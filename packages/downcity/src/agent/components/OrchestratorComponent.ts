/**
 * OrchestratorComponent：单次 Agent run 编排组件抽象。
 *
 * 关键点（中文）
 * - 负责 requestId/tools/onStepCallback 等运行时编排。
 * - 不负责历史读写，不负责 system 解析，不负责 compact。
 */

import type { ModelMessage, Tool } from "ai";
import type { SessionMessageV1 } from "@agent/types/SessionMessage.js";
import type { SessionSystemMessage } from "@agent/types/SessionSystemMessage.js";
import { AgentComponent } from "./AgentComponent.js";

/**
 * 本轮运行编排输出。
 */
export type OrchestratorComposeResult = {
  /**
   * 本轮工具集合。
   */
  tools: Record<string, Tool>;
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
   * 组装一次 run 所需运行态。
   */
  abstract compose(): Promise<OrchestratorComposeResult>;

  /**
   * 构造 prepareStep 回调。
   */
  abstract createPrepareStepHandler(
    input: {
      /**
       * 当前轮 system 消息。
       */
      system: SessionSystemMessage[];
      /**
       * 将新增 user 消息转换为可追加的模型消息。
       */
      appendMergedUserMessages: (
        messages: SessionMessageV1[],
      ) => Promise<ModelMessage[]>;
    },
  ): (input: { messages?: ModelMessage[] }) => Promise<{
    system: SessionSystemMessage[];
    messages?: ModelMessage[];
  }>;

  /**
   * 构造 onStepFinish 回调。
   */
  abstract createOnStepFinishHandler(): (stepResult: unknown) => Promise<void>;

  /**
   * 构造 fallback assistant 消息。
   *
   * 关键点（中文）
   * - fallback 消息构造由 orchestrator 内部实现，Agent 不直接依赖 persistor。
   */
  abstract buildFallbackAssistantMessage(text: string): SessionMessageV1;
}
