/**
 * RuntimeOrchestrator：运行时编排组件实现。
 *
 * 关键点（中文）
 * - 统一组装 requestId/tools。
 * - step 边界回调从 RequestContext 读取，Agent 不直接管理来源。
 */

import { generateId } from "@utils/Id.js";
import type { ModelMessage } from "ai";
import {
  drainInjectedUserMessages,
  requestContext,
} from "@agent/context/manager/RequestContext.js";
import { OrchestratorComponent } from "@agent/components/OrchestratorComponent.js";
import type {
  OrchestratorComposeResult,
} from "@agent/components/OrchestratorComponent.js";
import type { SessionMessageV1 } from "@agent/types/SessionMessage.js";
import type { SessionSystemMessage } from "@agent/types/SessionSystemMessage.js";
import type { Tool } from "ai";

type RuntimeOrchestratorOptions = {
  /**
   * 可选默认 session id。
   */
  sessionId?: string;

  /**
   * 读取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;
};

/**
 * RuntimeOrchestrator 默认实现。
 */
export class RuntimeOrchestrator extends OrchestratorComponent {
  readonly name = "runtime_orchestrator";
  private readonly sessionId: string;
  private readonly getTools: RuntimeOrchestratorOptions["getTools"];

  constructor(options: RuntimeOrchestratorOptions) {
    super();
    this.sessionId = String(options.sessionId || "").trim();
    this.getTools = options.getTools;
  }

  async compose(): Promise<OrchestratorComposeResult> {
    const requestId = generateId();
    const tools = this.getTools();
    const ctx = requestContext.getStore();
    const sessionId = String(ctx?.sessionId || this.sessionId || "").trim();
    if (!sessionId) {
      throw new Error(
        "RuntimeOrchestrator.compose requires a sessionId from requestContext or options.sessionId",
      );
    }
    // 关键点（中文）：requestId/sessionId 统一回填到请求上下文，后续组件直接读取。
    if (ctx && typeof ctx === "object") {
      ctx.requestId = requestId;
      if (!ctx.sessionId) ctx.sessionId = sessionId;
    }
    return {
      tools,
    };
  }

  createPrepareStepHandler(
    input: {
      system: SessionSystemMessage[];
      appendMergedUserMessages: (
        messages: SessionMessageV1[],
      ) => Promise<ModelMessage[]>;
    },
  ): (input: { messages?: ModelMessage[] }) => Promise<{
    system: SessionSystemMessage[];
    messages?: ModelMessage[];
  }> {
    return async ({
      messages,
    }: {
      messages?: ModelMessage[];
    }): Promise<{
      system: SessionSystemMessage[];
      messages?: ModelMessage[];
    }> => {
      const injectedMessages = drainInjectedUserMessages();
      const onStepCallback = requestContext.getStore()?.onStepCallback;
      if (
        typeof onStepCallback !== "function" &&
        injectedMessages.length === 0
      ) {
        return { system: input.system };
      }

      const incomingMessages: ModelMessage[] = Array.isArray(messages)
        ? messages
        : [];
      let outMessages: ModelMessage[] | undefined;
      try {
        const mergedMessages =
          typeof onStepCallback === "function" ? await onStepCallback() : [];
        const mergedWithInjected = [
          ...injectedMessages,
          ...(Array.isArray(mergedMessages) ? mergedMessages : []),
        ];
        const mergedModelMessages = await input.appendMergedUserMessages(
          mergedWithInjected,
        );
        if (mergedModelMessages.length > 0) {
          // 关键点（中文）：保持当前 step 已有消息顺序不变，只把新增 user 消息追加到末尾。
          outMessages = [...incomingMessages, ...mergedModelMessages];
        }
      } catch {
        // ignore merge hook failures
      }

      return {
        system: input.system,
        ...(Array.isArray(outMessages) ? { messages: outMessages } : {}),
      };
    };
  }

  createOnStepFinishHandler(): (stepResult: unknown) => Promise<void> {
    const onAssistantStepCallback = requestContext.getStore()?.onAssistantStepCallback;
    let assistantStepIndex = 0;
    return async (stepResult: unknown): Promise<void> => {
      const step = stepResult as { text?: unknown };
      const stepText = String(step.text || "").trim();
      if (typeof onAssistantStepCallback !== "function" || !stepText) return;
      try {
        assistantStepIndex += 1;
        await onAssistantStepCallback({
          text: stepText,
          // 关键点（中文）：1-based step 序号，按回调触发次数递增。
          stepIndex: assistantStepIndex,
        });
      } catch {
        // ignore assistant step callback failures
      }
    };
  }

  /**
   * 构造 fallback assistant 消息。
   */
  buildFallbackAssistantMessage(text: string): SessionMessageV1 {
    const ctx = requestContext.getStore();
    const sessionId = String(ctx?.sessionId || this.sessionId || "").trim();
    if (!sessionId) {
      throw new Error(
        "RuntimeOrchestrator.buildFallbackAssistantMessage requires a sessionId from requestContext or options.sessionId",
      );
    }
    const requestId = String(ctx?.requestId || "").trim();
    return {
      id: `a:${sessionId}:${generateId()}`,
      role: "assistant",
      metadata: {
        v: 1,
        ts: Date.now(),
        sessionId,
        ...(requestId ? { requestId } : {}),
        source: "egress",
        kind: "normal",
      },
      parts: [{ type: "text", text: String(text ?? "") }],
    };
  }
}
