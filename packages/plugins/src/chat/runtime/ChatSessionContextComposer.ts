/**
 * ChatSessionContextComposer：chat 专用 context composer。
 *
 * 关键点（中文）
 * - 由 chat 层在 Session 实例化时注入，不再依赖 run 时层层传 callback。
 * - step 合并消息读取自 ChatSession 当前绑定的 turn context。
 * - 其余能力（tools / fallback assistant）继续复用默认本地实现。
 */

import type { ModelMessage, Tool } from "ai";
import { LocalSessionContextComposer } from "@downcity/agent";
import type { SessionRecordV1 } from "@downcity/agent";
import type { SessionRunContext } from "@downcity/agent";
import type { SessionSystemMessage } from "@downcity/agent";
import type { ChatSessionTurnState } from "@/chat/runtime/ChatSessionTypes.js";

type ChatSessionContextComposerOptions = {
  /**
   * 当前 session 标识。
   */
  sessionId: string;

  /**
   * 读取当前可用工具集合。
   */
  getTools: () => Record<string, Tool>;

  /**
   * 读取当前已绑定的 chat turn 状态。
   */
  getTurnState: () => ChatSessionTurnState | null;
};

/**
 * ChatSession 专用 context composer。
 */
export class ChatSessionContextComposer extends LocalSessionContextComposer {
  private readonly getTurnState: ChatSessionContextComposerOptions["getTurnState"];

  constructor(options: ChatSessionContextComposerOptions) {
    super({
      sessionId: options.sessionId,
      getTools: options.getTools,
    });
    this.getTurnState = options.getTurnState;
  }

  createPrepareStepHandler(
    input: {
      system: SessionSystemMessage[];
      appendMergedUserMessages: (
        messages: SessionRecordV1[],
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
      const turnState = this.getTurnState();
      const onStepCallback = turnState?.onStepCallback;
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
          typeof onStepCallback === "function"
            ? await onStepCallback()
            : [];
        const mergedWithInjected = [
          ...injectedMessages,
          ...(Array.isArray(mergedMessages) ? mergedMessages : []),
        ];
        const mergedModelMessages = await input.appendMergedUserMessages(
          mergedWithInjected,
        );
        if (mergedModelMessages.length > 0) {
          // 关键点（中文）：保持当前 step 顺序，仅把新增 chat user 消息追加到末尾。
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
}
