/**
 * ChatSession：chat 专用 Session 实现。
 *
 * 关键点（中文）
 * - ChatSession 在实例化时持有自己的 execution composer 实例。
 * - chat 当前 turn 的 step 合并/step 回发状态都绑定在 Session 自身，不再新增 `runChat` 一层入口。
 * - 外层仍只调用标准 `run(...)`；chat 语义由 ChatSession 内部收敛。
 */

import { Session } from "@session/Session.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import type { ChatSessionExecutionComposer } from "@services/chat/runtime/ChatSessionExecutionComposer.js";
import type { SessionExecutor } from "@/types/session/SessionExecutor.js";
import type { SessionAssistantStepCallback } from "@/types/session/SessionRun.js";
import type { SessionRunResult } from "@/types/session/SessionRun.js";
import type { ChatSessionTurnState } from "@/types/chat/ChatSession.js";

type ChatSessionOptions = {
  /**
   * 当前会话 ID。
   */
  sessionId: string;

  /**
   * 当前 session 的 history composer。
   */
  historyComposer: SessionHistoryComposer;

  /**
   * 当前 session 绑定的 chat execution composer。
   */
  executionComposer: ChatSessionExecutionComposer;

  /**
   * 创建当前 session 的执行器。
   */
  createExecutor: (
    historyComposer: SessionHistoryComposer,
    executionComposer: ChatSessionExecutionComposer,
  ) => SessionExecutor;

  /**
   * session 更新后的异步回调。
   */
  runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
};

/**
 * Chat 专用 Session。
 */
export class ChatSession extends Session {
  /**
   * ChatSession 持有的 composer 实例。
   */
  readonly executionComposer: ChatSessionExecutionComposer;

  private activeTurnState: ChatSessionTurnState | null = null;

  constructor(options: ChatSessionOptions) {
    const executionComposer = options.executionComposer;
    super({
      sessionId: options.sessionId,
      historyComposer: options.historyComposer,
      createExecutor: (historyComposer) =>
        options.createExecutor(historyComposer, executionComposer),
      ...(options.runAfterSessionUpdated
        ? { runAfterSessionUpdated: options.runAfterSessionUpdated }
        : {}),
    });
    this.executionComposer = executionComposer;
  }

  /**
   * 读取当前绑定的 chat turn 状态。
   */
  getTurnState(): ChatSessionTurnState | null {
    return this.activeTurnState;
  }

  /**
   * 处理一次 assistant step 回发。
   *
   * 关键点（中文）
   * - step 持久化由基类 `Session.run` 先完成。
   * - 这里仅负责把当前 turn 绑定的外部回发钩子继续调出去。
   */
  private readonly forwardAssistantStep: SessionAssistantStepCallback = async (
    step,
  ): Promise<void> => {
    const callback = this.activeTurnState?.onAssistantStepCallback;
    if (typeof callback !== "function") return;
    await callback(step);
  };

  /**
   * 运行当前 chat session 的一次请求。
   *
   * 关键点（中文）
   * - 外层继续走统一的 `session.run(...)` 入口。
   * - ChatSession 只是在 run 生命周期里临时绑定 turn 状态给自己的 composer。
   */
  override async run(params: {
    query: string;
    onStepCallback?: ChatSessionTurnState["onStepCallback"];
    onAssistantStepCallback?: ChatSessionTurnState["onAssistantStepCallback"];
  }): Promise<SessionRunResult> {
    this.activeTurnState = {
      ...(typeof params.onStepCallback === "function"
        ? { onStepCallback: params.onStepCallback }
        : {}),
      ...(typeof params.onAssistantStepCallback === "function"
        ? { onAssistantStepCallback: params.onAssistantStepCallback }
        : {}),
    };
    try {
      return await super.run({
        query: params.query,
        onStepCallback: params.onStepCallback,
        onAssistantStepCallback: this.forwardAssistantStep,
      });
    } finally {
      this.activeTurnState = null;
    }
  }
}
