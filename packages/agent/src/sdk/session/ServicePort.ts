/**
 * SDK Session service 端口构造器。
 *
 * 关键点（中文）
 * - 把 SDK 本地 session 适配成 chat service 依赖的 `SessionPort`。
 * - service 侧直接复用底层 `Executor` 协议，避免 SDK `run()` 包装层重复补写消息。
 */

import type { SessionPort } from "@/core/AgentContextTypes.js";
import type { SessionHistoryStore } from "@/session/store/history/SessionHistoryStore.js";

/**
 * 构造 SDK SessionPort 的参数。
 */
export interface CreateSessionServicePortParams {
  /**
   * 当前 sessionId。
   */
  sessionId: string;
  /**
   * 底层执行编排器。
   */
  executor: Omit<SessionPort, "sessionId" | "getHistoryStore">;
  /**
   * 当前 session 历史持久化端口。
   */
  historyStore: SessionHistoryStore;
  /**
   * 在执行前确保当前 session 已完成初始化与宿主级配置。
   */
  ensureReadyForExecution: () => Promise<void>;
  /**
   * session 更新后需要同步执行的持久化回调。
   */
  touchMetadata: () => Promise<void>;
}

/**
 * 创建供 service 使用的 session 端口。
 */
export function createSessionServicePort(
  params: CreateSessionServicePortParams,
): SessionPort {
  return {
    sessionId: params.sessionId,
    getExecutor: () => params.executor.getExecutor(),
    getHistoryStore: () => params.historyStore,
    run: async (runParams) => {
      await params.ensureReadyForExecution();
      return await params.executor.run(runParams);
    },
    clearExecutor: () => {
      params.executor.clearExecutor();
    },
    afterSessionUpdatedAsync: async () => {
      await params.executor.afterSessionUpdatedAsync();
    },
    appendUserMessage: async (messageParams) => {
      await params.executor.appendUserMessage(messageParams);
      await params.touchMetadata();
    },
    appendAssistantMessage: async (messageParams) => {
      await params.executor.appendAssistantMessage(messageParams);
      await params.touchMetadata();
    },
    isExecuting: () => params.executor.isExecuting(),
  };
}
