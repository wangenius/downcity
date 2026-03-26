/**
 * SessionManager：会话生命周期编排器（main 层）。
 *
 * 关键职责（中文）
 * - 负责 request scope 绑定与统一运行入口。
 * - 负责用户消息与助手消息入库。
 * - 通过 `SessionAgentDispatcher` 访问 SessionAgent/Persistor。
 */

import { withRequestContext } from "@agent/context/manager/RequestContext.js";
import type { RequestContext } from "@agent/context/manager/RequestContext.js";
import type {
  SessionMessageV1,
  SessionMetadataV1,
} from "@agent/types/SessionMessage.js";
import type { AgentResult } from "@agent/types/Agent.js";
import type { JsonObject } from "@/types/Json.js";
import { SessionAgentDispatcher } from "@agent/context/context-agent/SessionAgentDispatcher.js";

/**
 * SessionManager：统一会话运行管理容器。
 */
export class SessionManager {
  private readonly dispatcher: SessionAgentDispatcher;
  private readonly runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
  private readonly executingSessionIds: Set<string> = new Set();

  /**
   * 构造函数：装配组件。
   */
  constructor(params: {
    dispatcher: SessionAgentDispatcher;
    runAfterSessionUpdated?: (sessionId: string) => Promise<void>;
  }) {
    this.dispatcher = params.dispatcher;
    this.runAfterSessionUpdated = params.runAfterSessionUpdated;
  }

  /**
   * 获取（或创建）Persistor。
   */
  getPersistor(sessionId: string) {
    return this.dispatcher.getPersistor(sessionId);
  }

  /**
   * 获取（或创建）SessionAgent。
   */
  getAgent(sessionId: string) {
    return this.dispatcher.getAgent(sessionId);
  }

  /**
   * 执行一次 Session run（统一调用链）。
   *
   * 关键点（中文）
   * - 收敛 `dispatcher.getAgent + withRequestContext + sessionAgent.run`。
   * - 调用方只传 `sessionId/query` 与可选运行态覆盖参数。
   */
  async run(params: {
    sessionId: string;
    query: string;
    requestContext?: Omit<RequestContext, "sessionId">;
  }): Promise<AgentResult> {
    const sessionId = String(params.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("SessionManager.run requires a non-empty sessionId");
    }
    const query = String(params.query || "").trim();
    const agent = this.dispatcher.getAgent(sessionId);
    const requestContext = params.requestContext || {};
    let persistedAssistantStepCount = 0;
    const providedOnAssistantStepCallback = requestContext.onAssistantStepCallback;
    const wrappedOnAssistantStepCallback = async (step: {
      text: string;
      stepIndex: number;
    }): Promise<void> => {
      const stepText = String(step.text || "").trim();
      if (!stepText) return;

      await this.appendAssistantMessage({
        sessionId,
        fallbackText: stepText,
        extra: {
          internal: "assistant_step",
          stepIndex: step.stepIndex,
          persistedBy: "session_manager_run",
        },
      });
      persistedAssistantStepCount += 1;

      if (typeof providedOnAssistantStepCallback === "function") {
        await providedOnAssistantStepCallback(step);
      }
    };
    this.executingSessionIds.add(sessionId);
    try {
      const result = await withRequestContext(
        {
          sessionId,
          ...requestContext,
          onAssistantStepCallback: wrappedOnAssistantStepCallback,
        },
        () => agent.run({ query }),
      );
      if (persistedAssistantStepCount <= 0) return result;

      return {
        ...result,
        assistantMessage: {
          ...result.assistantMessage,
          metadata: {
            ...(result.assistantMessage.metadata || {
              v: 1 as const,
              ts: Date.now(),
              sessionId,
            }),
            extra: {
              ...(
                result.assistantMessage.metadata?.extra &&
                  typeof result.assistantMessage.metadata.extra === "object" &&
                  !Array.isArray(result.assistantMessage.metadata.extra)
                  ? result.assistantMessage.metadata.extra
                  : {}
              ),
              assistantStepMessagesPersisted: true,
              assistantStepCount: persistedAssistantStepCount,
            },
          },
        },
      };
    } finally {
      this.executingSessionIds.delete(sessionId);
    }
  }

  /**
   * 判断指定 session 是否正在执行。
   */
  isSessionExecuting(sessionId: string): boolean {
    const key = String(sessionId || "").trim();
    if (!key) return false;
    return this.executingSessionIds.has(key);
  }

  /**
   * 返回当前正在执行的 session id 列表。
   */
  listExecutingSessionIds(): string[] {
    return [...this.executingSessionIds];
  }

  /**
   * 返回当前执行中的 session 数量。
   */
  getExecutingSessionCount(): number {
    return this.executingSessionIds.size;
  }

  /**
   * 清理 SessionAgent 缓存。
   */
  clearAgent(sessionId?: string): void {
    this.dispatcher.clearAgent(sessionId);
  }

  /**
   * 触发会话更新回调。
   */
  async afterSessionUpdatedAsync(sessionId: string): Promise<void> {
    const key = String(sessionId || "").trim();
    if (!key) return;
    if (!this.runAfterSessionUpdated) return;
    try {
      await this.runAfterSessionUpdated(key);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 user 消息到历史。
   */
  async appendUserMessage(params: {
    sessionId: string;
    message?: SessionMessageV1 | null;
    text?: string;
    requestId?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const sessionId = String(params.sessionId || "").trim();
    if (!sessionId) return;

    try {
      const persistor = this.dispatcher.getPersistor(sessionId);
      const message = params.message;
      if (message && typeof message === "object") {
        await persistor.append(message);
        void this.afterSessionUpdatedAsync(sessionId);
        return;
      }

      const fallbackText = String(params.text || "").trim();
      if (!fallbackText) return;

      const msg = persistor.userText({
        text: fallbackText,
        metadata: {
          sessionId,
          requestId: params.requestId,
          extra: params.extra,
        } as Omit<SessionMetadataV1, "v" | "ts">,
      });
      await persistor.append(msg);
      void this.afterSessionUpdatedAsync(sessionId);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 assistant 消息到历史。
   */
  async appendAssistantMessage(params: {
    sessionId: string;
    message?: SessionMessageV1 | null;
    fallbackText?: string;
    requestId?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const sessionId = String(params.sessionId || "").trim();
    if (!sessionId) return;

    try {
      const persistor = this.dispatcher.getPersistor(sessionId);
      const message = params.message;
      if (message && typeof message === "object") {
        await persistor.append(message);
        void this.afterSessionUpdatedAsync(sessionId);
        return;
      }

      const fallbackText = String(params.fallbackText || "").trim();
      if (!fallbackText) return;

      await persistor.append(
        persistor.assistantText({
          text: fallbackText,
          metadata: {
            sessionId,
            requestId: params.requestId,
            extra: params.extra,
          },
          kind: "normal",
          source: "egress",
        }),
      );
      void this.afterSessionUpdatedAsync(sessionId);
    } catch {
      // ignore
    }
  }
}
