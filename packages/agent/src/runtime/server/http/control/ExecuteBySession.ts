/**
 * Control execute by session helper。
 *
 * 关键点（中文）
 * - chatKey session 优先复用 chat 平台队列链路（与平台入站执行一致）。
 * - 非 chat session 保留原有直接执行语义。
 */

import type { AgentRuntime } from "@/core/AgentCoreTypes.js";
import type { AgentContext } from "@/core/AgentContextTypes.js";
import type { JsonObject } from "@/types/common/Json.js";
import type { ControlSessionExecuteAttachmentInput } from "@/runtime/server/http/control/types/ControlSessionExecute.js";
import { resolveChatQueueStore } from "@/plugin/builtins/chat/runtime/ChatQueue.js";
import { resolveDispatchTargetByChatKey } from "@/plugin/builtins/chat/runtime/ChatkeySend.js";
import { appendExecIngress } from "@/plugin/builtins/chat/runtime/ChatIngressStore.js";
import { buildQueuedUserMessageWithInfo } from "@/plugin/builtins/chat/runtime/QueuedUserMessage.js";
import { buildExecuteInputText } from "./Helpers.js";

/**
 * 在指定 session 中执行一轮请求。
 *
 * 说明（中文）
 * - 若 `sessionId` 能解析为 chat 分发目标，则改为入 chat queue。
 * - 否则按普通 session 同步执行。
 */
export async function executeBySessionId(params: {
  agentState: AgentRuntime;
  executionContext: AgentContext;
  sessionId: string;
  instructions: string;
  attachments?: ControlSessionExecuteAttachmentInput[];
}) {
  const sessionId = String(params.sessionId || "").trim();
  const instructions = String(params.instructions || "").trim();
  if (!sessionId) throw new Error("Missing sessionId");
  if (!instructions) throw new Error("Missing instructions");

  const executeInput = await buildExecuteInputText({
    projectRoot: params.agentState.rootPath,
    sessionId,
    instructions,
    attachments: params.attachments,
  });

  const dispatchTarget = await resolveDispatchTargetByChatKey({
    context: params.executionContext,
    chatKey: sessionId,
  });
  if (dispatchTarget) {
    const queuedText = buildQueuedUserMessageWithInfo({
      messageId: dispatchTarget.messageId,
      text: executeInput,
    });
    const ingressExtra: JsonObject = {
      source: "tui_session_execute",
      ingressKind: "exec",
      trigger: "api_execute",
    };

    try {
      await appendExecIngress({
        context: params.executionContext,
        sessionId,
        channel: dispatchTarget.channel,
        chatId: dispatchTarget.chatId,
        text: queuedText,
        ...(dispatchTarget.chatType ? { targetType: dispatchTarget.chatType } : {}),
        ...(typeof dispatchTarget.messageThreadId === "number"
          ? { threadId: dispatchTarget.messageThreadId }
          : {}),
        ...(dispatchTarget.messageId ? { messageId: dispatchTarget.messageId } : {}),
        extra: ingressExtra,
      });
    } catch (error) {
      params.agentState.logger.warn("Control execute ingress append failed", {
        sessionId,
        error: String(error),
      });
    }

    const enqueueResult = resolveChatQueueStore(params.executionContext).enqueue({
      kind: "exec",
      channel: dispatchTarget.channel,
      targetId: dispatchTarget.chatId,
      sessionId,
      text: queuedText,
      ...(dispatchTarget.chatType ? { targetType: dispatchTarget.chatType } : {}),
      ...(typeof dispatchTarget.messageThreadId === "number"
        ? { threadId: dispatchTarget.messageThreadId }
        : {}),
      ...(dispatchTarget.messageId ? { messageId: dispatchTarget.messageId } : {}),
      extra: ingressExtra,
    });

    return {
      success: true,
      queued: true,
      queueItemId: enqueueResult.itemId,
      queuePosition: enqueueResult.lanePosition,
      userVisible: "",
    };
  }

  const session = params.agentState.getSession(sessionId);
  const turn = await session.prompt({
    query: executeInput,
    extra: {
      ingressKind: "exec",
      via: "tui_session_execute",
    },
  });
  const result = await turn.finished;

  return {
    success: result.success,
    ...(result.error ? { error: result.error } : {}),
    assistantMessage: result.assistantMessage,
    userVisible: result.text.trim(),
    queued: false,
  };
}
