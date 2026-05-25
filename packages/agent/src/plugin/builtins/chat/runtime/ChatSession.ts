/**
 * ChatSession：chat 专用 Executor 实现。
 *
 * 关键点（中文）
 * - ChatSession 在实例化时持有自己的 context composer 实例。
 * - chat 当前 turn 的 step 合并/step 回发状态都绑定在 Session 自身，不再新增 `runChat` 一层入口。
 * - 外层仍只调用标准 `run(...)`；chat 语义由 ChatSession 内部收敛。
 */

import type { LanguageModel, Tool } from "ai";
import { Executor } from "@session/Executor.js";
import type { SessionHistoryComposer } from "@session/composer/history/SessionHistoryComposer.js";
import type { SessionHistoryStore } from "@/session/store/history/SessionHistoryStore.js";
import type { SessionCompactionComposer } from "@session/composer/compaction/SessionCompactionComposer.js";
import type { SessionSystemComposer } from "@session/composer/system/SessionSystemComposer.js";
import type { ChatSessionContextComposer } from "@/plugin/builtins/chat/runtime/ChatSessionContextComposer.js";
import type { Logger } from "@/utils/logger/Logger.js";
import type { SessionAssistantStepCallback } from "@/session/types/SessionRun.js";
import type { SessionRunResult } from "@/session/types/SessionRun.js";
import type { ChatSessionTurnState } from "@/plugin/builtins/chat/runtime/ChatSessionTypes.js";

type ChatSessionOptions = {
  /**
   * 当前会话 ID。
   */
  sessionId: string;

  /**
   * 当前 session 的 history store。
   */
  historyStore: SessionHistoryStore;

  /**
   * 当前 session 的 history composer。
   */
  historyComposer: SessionHistoryComposer;

  /**
   * 读取当前 session 使用的模型实例。
   */
  getModel: () => LanguageModel | undefined;

  /**
   * 统一日志器。
   */
  logger: Logger;

  /**
   * 当前 session 对应的 compaction Composer。
   */
  compactionComposer: SessionCompactionComposer;

  /**
   * 当前 session 对应的 system Composer。
   */
  systemComposer: SessionSystemComposer;

  /**
   * 获取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;

  /**
   * 当前 session 绑定的 chat context composer。
   */
  contextComposer: ChatSessionContextComposer;

  /**
   * session 更新后的异步回调。
   */
  runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
};

/**
 * Chat 专用 Session。
 */
export class ChatSession extends Executor {
  /**
   * ChatSession 持有的 composer 实例。
   */
  readonly contextComposer: ChatSessionContextComposer;

  private activeTurnState: ChatSessionTurnState | null = null;

  constructor(options: ChatSessionOptions) {
    const contextComposer = options.contextComposer;
    super({
      sessionId: options.sessionId,
      historyStore: options.historyStore,
      historyComposer: options.historyComposer,
      getModel: options.getModel,
      logger: options.logger,
      compactionComposer: options.compactionComposer,
      systemComposer: options.systemComposer,
      getTools: options.getTools,
      contextComposer,
      ...(options.runAfterSessionUpdated
        ? { runAfterSessionUpdated: options.runAfterSessionUpdated }
        : {}),
    });
    this.contextComposer = contextComposer;
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
   * - 外层继续走统一的内部执行入口。
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
