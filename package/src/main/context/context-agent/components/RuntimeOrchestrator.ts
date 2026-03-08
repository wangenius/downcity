/**
 * RuntimeOrchestrator：运行时编排组件实现。
 *
 * 关键点（中文）
 * - 统一组装 requestId/tools。
 * - step 边界回调从 RequestContext 读取，Agent 不直接管理来源。
 */

import { generateId } from "@utils/Id.js";
import type { ModelMessage } from "ai";
import { requestContext } from "@main/context/manager/RequestContext.js";
import { OrchestratorComponent } from "@main/agent/components/OrchestratorComponent.js";
import type {
  OrchestratorComposeResult,
} from "@main/agent/components/OrchestratorComponent.js";
import type { ContextMessageV1 } from "@main/types/ContextMessage.js";
import type { ContextSystemMessage } from "@main/types/ContextSystemMessage.js";
import type { Tool } from "ai";

type RuntimeOrchestratorOptions = {
  /**
   * 可选默认 context id。
   */
  contextId?: string;

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
  private readonly contextId: string;
  private readonly getTools: RuntimeOrchestratorOptions["getTools"];

  constructor(options: RuntimeOrchestratorOptions) {
    super();
    this.contextId = String(options.contextId || "").trim();
    this.getTools = options.getTools;
  }

  async compose(): Promise<OrchestratorComposeResult> {
    const requestId = generateId();
    const tools = this.getTools();
    const ctx = requestContext.getStore();
    const contextId = String(ctx?.contextId || this.contextId || "").trim();
    if (!contextId) {
      throw new Error(
        "RuntimeOrchestrator.compose requires a contextId from requestContext or options.contextId",
      );
    }
    // 关键点（中文）：requestId/contextId 统一回填到请求上下文，后续组件直接读取。
    if (ctx && typeof ctx === "object") {
      ctx.requestId = requestId;
      if (!ctx.contextId) ctx.contextId = contextId;
    }
    return {
      tools,
    };
  }

  createPrepareStepHandler(
    input: {
      system: ContextSystemMessage[];
      appendMergedUserMessages: (
        messages: ContextMessageV1[],
      ) => Promise<ModelMessage[]>;
    },
  ): (input: { messages?: ModelMessage[] }) => Promise<{
    system: ContextSystemMessage[];
    messages?: ModelMessage[];
  }> {
    return async ({
      messages,
    }: {
      messages?: ModelMessage[];
    }): Promise<{
      system: ContextSystemMessage[];
      messages?: ModelMessage[];
    }> => {
      const onStepCallback = requestContext.getStore()?.onStepCallback;
      if (typeof onStepCallback !== "function") {
        return { system: input.system };
      }

      const incomingMessages: ModelMessage[] = Array.isArray(messages)
        ? messages
        : [];
      let outMessages: ModelMessage[] | undefined;
      try {
        const mergedMessages = await onStepCallback();
        const mergedModelMessages = await input.appendMergedUserMessages(
          Array.isArray(mergedMessages) ? mergedMessages : [],
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
  buildFallbackAssistantMessage(text: string): ContextMessageV1 {
    const ctx = requestContext.getStore();
    const contextId = String(ctx?.contextId || this.contextId || "").trim();
    if (!contextId) {
      throw new Error(
        "RuntimeOrchestrator.buildFallbackAssistantMessage requires a contextId from requestContext or options.contextId",
      );
    }
    const requestId = String(ctx?.requestId || "").trim();
    return {
      id: `a:${contextId}:${generateId()}`,
      role: "assistant",
      metadata: {
        v: 1,
        ts: Date.now(),
        contextId,
        ...(requestId ? { requestId } : {}),
        source: "egress",
        kind: "normal",
      },
      parts: [{ type: "text", text: String(text ?? "") }],
    };
  }
}
