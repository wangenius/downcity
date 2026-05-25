/**
 * SDK Session runtime plugin 端口构造器。
 *
 * 关键点（中文）
 * - 把 SDK 本地 session 适配成 runtime / runtime plugin 依赖的 `SessionPort`。
 * - SDK 公开面只保留 `prompt()` / `subscribe()`；runtime/service 若要 one-shot 等待结果，也统一委托给 `prompt()`。
 */

import type { SessionPort } from "@/core/AgentContextTypes.js";
import type { SessionHistoryStore } from "@/session/store/history/SessionHistoryStore.js";
import type { AgentSessionPromptInput } from "@/types/sdk/AgentSessionPrompt.js";
import type {
  AgentSessionSubscriber,
  AgentSessionUnsubscribe,
} from "@/types/sdk/AgentSessionEvent.js";
import type { AgentSessionTurnHandle } from "@/types/sdk/AgentSessionTurn.js";

/**
 * 构造 SDK SessionPort 的参数。
 */
export interface CreateRuntimeSessionPortParams {
  /**
   * 当前 sessionId。
   */
  sessionId: string;
  /**
   * 读取当前 session 底层执行端口。
   */
  getExecutor: SessionPort["getExecutor"];
  /**
   * 追加一条新的 session prompt。
   */
  prompt: (input: AgentSessionPromptInput) => Promise<AgentSessionTurnHandle>;
  /**
   * 订阅当前 session 的 future 事件。
   */
  subscribe: (
    subscriber: AgentSessionSubscriber,
  ) => AgentSessionUnsubscribe;
  /**
   * 清理当前 session executor 状态。
   */
  clearExecutor: () => void;
  /**
   * session 更新后的异步通知回调。
   */
  afterSessionUpdatedAsync: () => Promise<void>;
  /**
   * 追加 user 消息到底层历史。
   */
  appendUserMessage: SessionPort["appendUserMessage"];
  /**
   * 追加 assistant 消息到底层历史。
   */
  appendAssistantMessage: SessionPort["appendAssistantMessage"];
  /**
   * 返回当前 session 是否正在执行。
   */
  isExecuting: () => boolean;
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
 * 创建供 runtime plugin 使用的 session 端口。
 */
export function createRuntimeSessionPort(
  params: CreateRuntimeSessionPortParams,
): SessionPort {
  return {
    sessionId: params.sessionId,
    getExecutor: () => params.getExecutor(),
    getHistoryStore: () => params.historyStore,
    prompt: async (input) => {
      await params.ensureReadyForExecution();
      return await params.prompt(input);
    },
    subscribe: (subscriber) => {
      return params.subscribe(subscriber);
    },
    clearExecutor: () => {
      params.clearExecutor();
    },
    afterSessionUpdatedAsync: async () => {
      await params.afterSessionUpdatedAsync();
    },
    appendUserMessage: async (messageParams) => {
      await params.appendUserMessage(messageParams);
      await params.touchMetadata();
    },
    appendAssistantMessage: async (messageParams) => {
      await params.appendAssistantMessage(messageParams);
      await params.touchMetadata();
    },
    isExecuting: () => params.isExecuting(),
  };
}
