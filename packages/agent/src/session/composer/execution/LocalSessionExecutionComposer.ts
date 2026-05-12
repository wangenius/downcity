/**
 * LocalSessionExecutionComposer：本地 session 运行时编排 Composer 实现。
 *
 * 关键点（中文）
 * - 统一组装 tools。
 * - step 边界回调从 SessionRunScope 读取，LocalSessionCore 不直接管理来源。
 */

import type { ModelMessage } from "ai";
import { generateId } from "@shared/utils/Id.js";
import {
  drainInjectedUserMessages,
  getSessionRunScope,
} from "@session/SessionRunScope.js";
import { SessionExecutionComposer } from "@session/composer/execution/SessionExecutionComposer.js";
import type {
  SessionExecutionComposeResult,
} from "@session/composer/execution/SessionExecutionComposer.js";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import type { SessionSystemMessage } from "@/types/session/SessionPrompts.js";
import type { Tool } from "ai";

type LocalSessionExecutionComposerOptions = {
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
 * LocalSessionExecutionComposer 默认 Composer 实现。
 */
export class LocalSessionExecutionComposer extends SessionExecutionComposer {
  readonly name = "runtime_execution_composer";
  private readonly sessionId: string;
  private readonly getTools: LocalSessionExecutionComposerOptions["getTools"];

  constructor(options: LocalSessionExecutionComposerOptions) {
    super();
    this.sessionId = String(options.sessionId || "").trim();
    this.getTools = options.getTools;
  }

  async compose(): Promise<SessionExecutionComposeResult> {
    const tools = this.getTools();
    const ctx = getSessionRunScope();
    const sessionId = String(ctx?.sessionId || this.sessionId || "").trim();
    if (!sessionId) {
      throw new Error(
        "LocalSessionExecutionComposer.compose requires a sessionId from sessionRunScope or options.sessionId",
      );
    }
    // 关键点（中文）：sessionId 统一回填到请求上下文，后续组件直接读取。
    if (ctx && typeof ctx === "object") {
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
      const onStepCallback = getSessionRunScope()?.onStepCallback;
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
    const onAssistantStepCallback = getSessionRunScope()?.onAssistantStepCallback;
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
  buildFallbackAssistantMessage(text: string): SessionMessageV1 {
    const ctx = getSessionRunScope();
    const sessionId = String(ctx?.sessionId || this.sessionId || "").trim();
    if (!sessionId) {
      throw new Error(
        "LocalSessionExecutionComposer.buildFallbackAssistantMessage requires a sessionId from sessionRunScope or options.sessionId",
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
