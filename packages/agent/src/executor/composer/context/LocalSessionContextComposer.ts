/**
 * LocalSessionContextComposer：本地 session 运行时编排 Composer 实现。
 *
 * 关键点（中文）
 * - 统一组装 tools。
 * - step 边界回调从 SessionRunScope 读取，Executor 不直接管理来源。
 */

import type { ModelMessage } from "ai";
import { generateId } from "@/utils/Id.js";
import type {
  SessionContextComposer,
  SessionContextComposeResult,
} from "@executor/composer/context/SessionContextComposer.js";
import type {
  SessionMessageV1,
  SessionModelMessageV1,
} from "@/executor/types/SessionMessages.js";
import type { SessionSystemMessage } from "@/executor/types/SessionPrompts.js";
import type { Tool } from "ai";
import type { SessionRunContext } from "@/types/executor/SessionRunContext.js";

type LocalSessionContextComposerOptions = {
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
 * LocalSessionContextComposer 默认 Composer 实现。
 */
export class LocalSessionContextComposer implements SessionContextComposer {
  readonly name = "runtime_context_composer";
  private readonly sessionId: string;
  private readonly getTools: LocalSessionContextComposerOptions["getTools"];

  constructor(options: LocalSessionContextComposerOptions) {
    this.sessionId = String(options.sessionId || "").trim();
    this.getTools = options.getTools;
  }

  async compose(
    run_context: SessionRunContext,
  ): Promise<SessionContextComposeResult> {
    const tools = this.getTools();
    const sessionId = String(
      run_context.sessionId || this.sessionId || "",
    ).trim();
    if (!sessionId) {
      throw new Error(
        "LocalSessionContextComposer.compose requires a non-empty sessionId",
      );
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
      runContext: SessionRunContext;
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
      const injectedMessages = [...input.runContext.injectedUserMessages];
      input.runContext.injectedUserMessages = [];
      const onStepCallback = input.runContext.onStepCallback;
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

  createOnStepFinishHandler(
    run_context: SessionRunContext,
  ): (stepResult: unknown) => Promise<void> {
    const onAssistantStepCallback = run_context.onAssistantStepCallback;
    let assistantStepIndex = 0;
    return async (stepResult: unknown): Promise<void> => {
      const step = stepResult as { text?: unknown };
      const stepText = String(step.text || "").trim();
      if (typeof onAssistantStepCallback !== "function") return;
      try {
        assistantStepIndex += 1;
        await onAssistantStepCallback({
          text: stepText,
          // 关键点（中文）：1-based step 序号，按回调触发次数递增。
          stepIndex: assistantStepIndex,
          stepResult,
        });
      } catch {
        // ignore assistant step callback failures
      }
    };
  }

  /**
   * 构造 fallback assistant 消息。
   */
  buildFallbackAssistantMessage(
    text: string,
    run_context: SessionRunContext,
  ): SessionModelMessageV1 {
    const sessionId = String(
      run_context.sessionId || this.sessionId || "",
    ).trim();
    if (!sessionId) {
      throw new Error(
        "LocalSessionContextComposer.buildFallbackAssistantMessage requires a non-empty sessionId",
      );
    }
    return {
      id: `a:${sessionId}:${generateId()}`,
      role: "assistant",
      metadata: {
        v: 1,
        ts: Date.now(),
        sessionId,
        source: "egress",
        kind: "normal",
      },
      parts: [{ type: "text", text: String(text ?? "") }],
    };
  }
}
