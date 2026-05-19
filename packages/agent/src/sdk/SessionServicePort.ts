/**
 * SDK Session service 端口构造器。
 *
 * 关键点（中文）
 * - 把 SDK 本地 session 适配成 chat service 依赖的 `SessionPort`。
 * - service 侧直接复用底层 `CoreSession` 协议，避免 SDK `run()` 包装层重复补写消息。
 */

import type { SessionPort } from "@/runtime/AgentContextTypes.js";

/**
 * 构造 SDK SessionPort 的参数。
 */
export interface CreateSdkSessionServicePortParams {
  /**
   * 当前 sessionId。
   */
  sessionId: string;
  /**
   * 底层 session 实例。
   */
  coreSession: Omit<SessionPort, "sessionId" | "getHistoryComposer">;
  /**
   * 当前 session 历史持久化端口。
   */
  historyComposer: ReturnType<SessionPort["getHistoryComposer"]>;
  /**
   * session 更新后需要同步执行的持久化回调。
   */
  touchMetadata: () => Promise<void>;
}

/**
 * 创建供 service 使用的 session 端口。
 */
export function createSdkSessionServicePort(
  params: CreateSdkSessionServicePortParams,
): SessionPort {
  return {
    sessionId: params.sessionId,
    getExecutor: () => params.coreSession.getExecutor(),
    getHistoryComposer: () => params.historyComposer,
    run: async (runParams) => {
      return await params.coreSession.run(runParams);
    },
    clearExecutor: () => {
      params.coreSession.clearExecutor();
    },
    afterSessionUpdatedAsync: async () => {
      await params.coreSession.afterSessionUpdatedAsync();
    },
    appendUserMessage: async (messageParams) => {
      await params.coreSession.appendUserMessage(messageParams);
      await params.touchMetadata();
    },
    appendAssistantMessage: async (messageParams) => {
      await params.coreSession.appendAssistantMessage(messageParams);
      await params.touchMetadata();
    },
    isExecuting: () => params.coreSession.isExecuting(),
  };
}
