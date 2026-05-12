/**
 * ChatSessionExecutionComposer：chat 专用 execution composer。
 *
 * 关键点（中文）
 * - 由 chat 层在 Session 实例化时注入，不再依赖 run 时层层传 callback。
 * - step 合并消息读取自 ChatSession 当前绑定的 turn context。
 * - 其余能力（tools / fallback assistant）继续复用默认本地实现。
 */

import type { ModelMessage, Tool } from "ai";
import { drainInjectedUserMessages } from "@session/SessionRunScope.js";
import { LocalSessionExecutionComposer } from "@session/composer/execution/LocalSessionExecutionComposer.js";
import type { SessionMessageV1 } from "@/types/session/SessionMessages.js";
import type { SessionSystemMessage } from "@/types/session/SessionPrompts.js";
import type { ChatSessionTurnState } from "@/types/chat/ChatSession.js";

type ChatSessionExecutionComposerOptions = {
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
 * ChatSession 专用 execution composer。
 */
export class ChatSessionExecutionComposer extends LocalSessionExecutionComposer {
  private readonly getTurnState: ChatSessionExecutionComposerOptions["getTurnState"];

  constructor(options: ChatSessionExecutionComposerOptions) {
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
