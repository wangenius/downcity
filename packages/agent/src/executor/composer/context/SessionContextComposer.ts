/**
 * SessionContextComposer：单次 Session run context 组装协议。
 *
 * 关键点（中文）
 * - 负责 tools / prepareStep / onStepFinish / fallback message factory 等运行上下文组装。
 * - 不负责历史读写，不负责 system 解析，不负责 compact。
 */

import type { ModelMessage, Tool } from "ai";
import type {
  SessionRecordV1,
  SessionMessageRecordV1,
} from "@/executor/types/SessionRecords.js";
import type { SessionSystemMessage } from "@/executor/types/SessionPrompts.js";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

/**
 * 本轮运行上下文组装输出。
 */
export type SessionContextComposeResult = {
  /**
   * 本轮工具集合。
   */
  tools: Record<string, Tool>;
};

/**
 * 运行上下文 Composer 协议。
 */
export interface SessionContextComposer {
  /**
   * Composer 名（由具体实现声明）。
   */
  readonly name: string;

  /**
   * 组装一次 run 所需上下文。
   */
  compose(run_context: SessionRunContext): Promise<SessionContextComposeResult>;

  /**
   * 构造 prepareStep 回调。
   */
  createPrepareStepHandler(
    input: {
      /**
       * 当前轮 system 消息。
       */
      system: SessionSystemMessage[];
      /**
       * 将新增 user 消息转换为可追加的模型消息。
       */
      appendMergedUserMessages: (
        messages: SessionRecordV1[],
      ) => Promise<ModelMessage[]>;
      /**
       * 当前显式运行上下文。
       */
      runContext: SessionRunContext;
    },
  ): (input: { messages?: ModelMessage[] }) => Promise<{
    system: SessionSystemMessage[];
    messages?: ModelMessage[];
  }>;

  /**
   * 构造 onStepFinish 回调。
   */
  createOnStepFinishHandler(
    run_context: SessionRunContext,
  ): (stepResult: unknown) => Promise<void>;

  /**
   * 构造 fallback assistant 消息。
   *
   * 关键点（中文）
   * - fallback 消息构造由 ContextComposer 内部实现，Executor 不直接依赖 history Composer。
   */
  buildFallbackAssistantMessage(
    text: string,
    run_context: SessionRunContext,
  ): SessionMessageRecordV1;
}
