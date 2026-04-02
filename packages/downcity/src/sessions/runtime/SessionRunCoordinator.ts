/**
 * SessionRunCoordinator：session run 编排层。
 *
 * 关键点（中文）
 * - 只负责 `run()` 这条执行链。
 * - request context 绑定、assistant step 持久化、执行状态收敛都放在这里。
 * - 不负责消息写入细节；消息补写统一委托给 `SessionMessageStore`。
 */

import { withRequestContext } from "@sessions/RequestContext.js";
import type { RequestContext } from "@sessions/RequestContext.js";
import type { SessionRunResult } from "@/types/SessionRun.js";
import { SessionRuntimeStore } from "@sessions/SessionRuntimeStore.js";
import { SessionExecutionState } from "@sessions/runtime/SessionExecutionState.js";
import { SessionMessageStore } from "@sessions/runtime/SessionMessageStore.js";
import { buildAssistantStepTimelineMessages } from "@sessions/runtime/AssistantStepTimeline.js";

/**
 * SessionRunCoordinator：统一执行协调器。
 */
export class SessionRunCoordinator {
  private readonly runtimeRegistry: SessionRuntimeStore;
  private readonly executionState: SessionExecutionState;
  private readonly messageStore: SessionMessageStore;

  constructor(params: {
    /**
     * Session runtime / persistor store。
     */
    runtimeRegistry: SessionRuntimeStore;
    /**
     * session 执行状态追踪器。
     */
    executionState: SessionExecutionState;
    /**
     * session 消息写入层。
     */
    messageStore: SessionMessageStore;
  }) {
    this.runtimeRegistry = params.runtimeRegistry;
    this.executionState = params.executionState;
    this.messageStore = params.messageStore;
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
    const sessionId = String(params.sessionId || "").trim();
    if (!sessionId) {
      throw new Error("SessionStore.run requires a non-empty sessionId");
    }

    const query = String(params.query || "").trim();
    const runtime = this.runtimeRegistry.getRuntime(sessionId);
    const requestContext = params.requestContext || {};
    let persistedAssistantStepCount = 0;
    const providedOnAssistantStepCallback = requestContext.onAssistantStepCallback;
    const wrappedOnAssistantStepCallback = async (step: {
      text: string;
      stepIndex: number;
      stepResult?: unknown;
    }): Promise<void> => {
      const stepMessages = buildAssistantStepTimelineMessages({
        sessionId,
        requestId:
          typeof requestContext.requestId === "string"
            ? requestContext.requestId
            : undefined,
        stepIndex: step.stepIndex,
        stepResult: step.stepResult,
        text: step.text,
      });
      if (stepMessages.length === 0) return;

      for (const stepMessage of stepMessages) {
        await this.messageStore.appendAssistantMessage({
          sessionId,
          message: stepMessage,
        });
        persistedAssistantStepCount += 1;
      }

      if (typeof providedOnAssistantStepCallback === "function") {
        await providedOnAssistantStepCallback(step);
      }
    };

    this.executionState.start(sessionId);
    try {
      const result = await withRequestContext(
        {
          sessionId,
          ...requestContext,
          onAssistantStepCallback: wrappedOnAssistantStepCallback,
        },
        () => runtime.run({ query }),
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
      this.executionState.finish(sessionId);
    }
  }
}
