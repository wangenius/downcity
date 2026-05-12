/**
 * SessionExecutionComposer：单次 Session run 编排 Composer 抽象。
 *
 * 关键点（中文）
 * - 负责 tools/onStepCallback 等运行时编排。
 * - 不负责历史读写，不负责 system 解析，不负责 compact。
 */

import type { ModelMessage, Tool } from "ai";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import type { SessionSystemMessage } from "@/types/session/SessionPrompts.js";
import { SessionComposer } from "@session/composer/SessionComposer.js";

/**
 * 本轮运行编排输出。
 */
export type SessionExecutionComposeResult = {
  /**
   * 本轮工具集合。
   */
  tools: Record<string, Tool>;
};

/**
 * 运行编排 Composer 抽象类。
 */
export abstract class SessionExecutionComposer extends SessionComposer {
  /**
   * Composer 名（由具体实现声明）。
   */
  abstract readonly name: string;

  /**
   * 组装一次 run 所需运行态。
   */
  abstract compose(): Promise<SessionExecutionComposeResult>;

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
 * - fallback 消息构造由 execution Composer 内部实现，LocalSessionCore 不直接依赖 history Composer。
   */
  abstract buildFallbackAssistantMessage(text: string): SessionMessageV1;
}
