/**
 * ContextManager：会话生命周期编排器（main 层）。
 *
 * 关键职责（中文）
 * - 负责 request scope 绑定与统一运行入口。
 * - 负责用户消息与助手消息入库。
 * - 通过 `ContextAgentDispatcher` 访问 ContextAgent/Persistor。
 */

import { withRequestContext } from "@agent/context/manager/RequestContext.js";
import type { RequestContext } from "@agent/context/manager/RequestContext.js";
import type {
  ContextMessageV1,
  ContextMetadataV1,
} from "@agent/types/ContextMessage.js";
import type { AgentResult } from "@agent/types/Agent.js";
import type { JsonObject } from "@/types/Json.js";
import { ContextAgentDispatcher } from "@agent/context/context-agent/ContextAgentDispatcher.js";

/**
 * ContextManager：统一会话运行管理容器。
 */
export class ContextManager {
  private readonly dispatcher: ContextAgentDispatcher;
  private readonly runAfterContextUpdated?: (contextId: string) => Promise<void>;
  private readonly executingContextIds: Set<string> = new Set();

  /**
   * 构造函数：装配组件。
   */
  constructor(params: {
    dispatcher: ContextAgentDispatcher;
    runAfterContextUpdated?: (contextId: string) => Promise<void>;
  }) {
    this.dispatcher = params.dispatcher;
    this.runAfterContextUpdated = params.runAfterContextUpdated;
  }

  /**
   * 获取（或创建）Persistor。
   */
  getPersistor(contextId: string) {
    return this.dispatcher.getPersistor(contextId);
  }

  /**
   * 获取（或创建）ContextAgent。
   */
  getAgent(contextId: string) {
    return this.dispatcher.getAgent(contextId);
  }

  /**
   * 执行一次 Context run（统一调用链）。
   *
   * 关键点（中文）
   * - 收敛 `dispatcher.getAgent + withRequestContext + contextAgent.run`。
   * - 调用方只传 `contextId/query` 与可选运行态覆盖参数。
   */
  async run(params: {
    contextId: string;
    query: string;
    requestContext?: Omit<RequestContext, "contextId">;
  }): Promise<AgentResult> {
    const contextId = String(params.contextId || "").trim();
    if (!contextId) {
      throw new Error("ContextManager.run requires a non-empty contextId");
    }
    const query = String(params.query || "").trim();
    const agent = this.dispatcher.getAgent(contextId);
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
        contextId,
        fallbackText: stepText,
        extra: {
          internal: "assistant_step",
          stepIndex: step.stepIndex,
          persistedBy: "context_manager_run",
        },
      });
      persistedAssistantStepCount += 1;

      if (typeof providedOnAssistantStepCallback === "function") {
        await providedOnAssistantStepCallback(step);
      }
    };
    this.executingContextIds.add(contextId);
    try {
      const result = await withRequestContext(
        {
          contextId,
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
              contextId,
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
      this.executingContextIds.delete(contextId);
    }
  }

  /**
   * 判断指定 context 是否正在执行。
   */
  isContextExecuting(contextId: string): boolean {
    const key = String(contextId || "").trim();
    if (!key) return false;
    return this.executingContextIds.has(key);
  }

  /**
   * 返回当前正在执行的 context id 列表。
   */
  listExecutingContextIds(): string[] {
    return [...this.executingContextIds];
  }

  /**
   * 返回当前执行中的 context 数量。
   */
  getExecutingContextCount(): number {
    return this.executingContextIds.size;
  }

  /**
   * 清理 ContextAgent 缓存。
   */
  clearAgent(contextId?: string): void {
    this.dispatcher.clearAgent(contextId);
  }

  /**
   * 触发会话更新回调。
   */
  async afterContextUpdatedAsync(contextId: string): Promise<void> {
    const key = String(contextId || "").trim();
    if (!key) return;
    if (!this.runAfterContextUpdated) return;
    try {
      await this.runAfterContextUpdated(key);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 user 消息到历史。
   */
  async appendUserMessage(params: {
    contextId: string;
    message?: ContextMessageV1 | null;
    text?: string;
    requestId?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const contextId = String(params.contextId || "").trim();
    if (!contextId) return;

    try {
      const persistor = this.dispatcher.getPersistor(contextId);
      const message = params.message;
      if (message && typeof message === "object") {
        await persistor.append(message);
        void this.afterContextUpdatedAsync(contextId);
        return;
      }

      const fallbackText = String(params.text || "").trim();
      if (!fallbackText) return;

      const msg = persistor.userText({
        text: fallbackText,
        metadata: {
          contextId,
          requestId: params.requestId,
          extra: params.extra,
        } as Omit<ContextMetadataV1, "v" | "ts">,
      });
      await persistor.append(msg);
      void this.afterContextUpdatedAsync(contextId);
    } catch {
      // ignore
    }
  }

  /**
   * 追加一条 assistant 消息到历史。
   */
  async appendAssistantMessage(params: {
    contextId: string;
    message?: ContextMessageV1 | null;
    fallbackText?: string;
    requestId?: string;
    extra?: JsonObject;
  }): Promise<void> {
    const contextId = String(params.contextId || "").trim();
    if (!contextId) return;

    try {
      const persistor = this.dispatcher.getPersistor(contextId);
      const message = params.message;
      if (message && typeof message === "object") {
        await persistor.append(message);
        void this.afterContextUpdatedAsync(contextId);
        return;
      }

      const fallbackText = String(params.fallbackText || "").trim();
      if (!fallbackText) return;

      await persistor.append(
        persistor.assistantText({
          text: fallbackText,
          metadata: {
            contextId,
            requestId: params.requestId,
            extra: params.extra,
          },
          kind: "normal",
          source: "egress",
        }),
      );
      void this.afterContextUpdatedAsync(contextId);
    } catch {
      // ignore
    }
  }
}
