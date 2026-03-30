/**
 * SessionStore：session 统一门面。
 *
 * 关键点（中文）
 * - 这是新的主名称，表达“agent 持有的一组 session 存储与执行入口”。
 * - 对外继续暴露 `getRuntime / getPersistor / run / append*` 等统一接口。
 * - 内部把职责拆给 execution state / message store / run coordinator。
 */

import { SessionRuntimeStore } from "@sessions/SessionRuntimeStore.js";
import { SessionExecutionState } from "@sessions/runtime/SessionExecutionState.js";
import { SessionMessageStore } from "@sessions/runtime/SessionMessageStore.js";
import { SessionRunCoordinator } from "@sessions/runtime/SessionRunCoordinator.js";
import type { RequestContext } from "@sessions/RequestContext.js";
import type {
  SessionMessageV1,
} from "@/types/SessionMessage.js";
import type { SessionRunResult } from "@/types/SessionRun.js";
import type { JsonObject } from "@/types/Json.js";

/**
 * SessionStore：统一会话运行管理容器。
 */
export class SessionStore {
  private readonly runtimeRegistry: SessionRuntimeStore;
  private readonly executionState: SessionExecutionState;
  private readonly messageStore: SessionMessageStore;
  private readonly runCoordinator: SessionRunCoordinator;

  /**
   * 构造函数：装配组件。
   */
  constructor(params: {
    /**
     * Session runtime / persistor store。
     */
    runtimeRegistry: SessionRuntimeStore;
    /**
     * session 更新后的异步回调。
     */
    runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
  }) {
    this.runtimeRegistry = params.runtimeRegistry;
    this.executionState = new SessionExecutionState();
    this.messageStore = new SessionMessageStore({
      runtimeRegistry: params.runtimeRegistry,
      runAfterSessionUpdated: params.runAfterSessionUpdated,
    });
    this.runCoordinator = new SessionRunCoordinator({
      runtimeRegistry: params.runtimeRegistry,
      executionState: this.executionState,
      messageStore: this.messageStore,
    });
  }

  /**
   * 获取（或创建）Persistor。
   */
  getPersistor(sessionId: string) {
    return this.runtimeRegistry.getPersistor(sessionId);
  }

  /**
   * 获取（或创建）SessionRuntime。
   */
  getRuntime(sessionId: string) {
    return this.runtimeRegistry.getRuntime(sessionId);
  }

  /**
   * 执行一次 Session run（统一调用链）。
   */
  async run(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 本轮输入文本。
     */
    query: string;
    /**
     * 可选 request context。
     */
    requestContext?: Omit<RequestContext, "sessionId">;
  }): Promise<SessionRunResult> {
    return await this.runCoordinator.run(params);
  }

  /**
   * 判断指定 session 是否正在执行。
   */
  isSessionExecuting(sessionId: string): boolean {
    return this.executionState.isExecuting(sessionId);
  }

  /**
   * 返回当前正在执行的 session id 列表。
   */
  listExecutingSessionIds(): string[] {
    return this.executionState.listExecutingSessionIds();
  }

  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number {
    return this.executionState.getExecutingSessionCount();
  }

  /**
   * 清理 SessionRuntime 缓存。
   */
  clearRuntime(sessionId?: string): void {
    this.runtimeRegistry.clearRuntime(sessionId);
  }

  /**
   * 触发会话更新回调。
   */
  async afterSessionUpdatedAsync(sessionId: string): Promise<void> {
    await this.messageStore.afterSessionUpdatedAsync(sessionId);
  }

  /**
   * 追加一条 user 消息到历史。
   */
  async appendUserMessage(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    text?: string;
    /**
     * 当前请求标识。
     */
    requestId?: string;
    /**
     * 附加元数据。
     */
    extra?: JsonObject;
  }): Promise<void> {
    await this.messageStore.appendUserMessage(params);
  }

  /**
   * 追加一条 assistant 消息到历史。
   */
  async appendAssistantMessage(params: {
    /**
     * 目标 session 标识。
     */
    sessionId: string;
    /**
     * 已构造好的完整消息。
     */
    message?: SessionMessageV1 | null;
    /**
     * 兜底文本内容。
     */
    fallbackText?: string;
    /**
     * 当前请求标识。
     */
    requestId?: string;
    /**
     * 附加元数据。
     */
    extra?: JsonObject;
  }): Promise<void> {
    await this.messageStore.appendAssistantMessage(params);
  }
}
