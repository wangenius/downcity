/**
 * Dashboard execute by context helper。
 *
 * 关键点（中文）
 * - chatKey 上下文优先复用 chat 平台队列链路（与平台入站执行一致）。
 * - 非 chat 上下文保留原有直接执行语义。
 */

import type { RuntimeState } from "@/agent/context/manager/RuntimeState.js";
import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import type { JsonObject } from "@/types/Json.js";
import type { DashboardSessionExecuteAttachmentInput } from "@/types/DashboardSessionExecute.js";
import { drainDeferredPersistedUserMessages } from "@agent/context/manager/RequestContext.js";
import { enqueueChatQueue } from "@services/chat/runtime/ChatQueue.js";
import { resolveDispatchTargetByChatKey } from "@services/chat/runtime/ChatkeySend.js";
import { appendExecIngress } from "@services/chat/runtime/ChatIngressStore.js";
import { buildQueuedUserMessageWithInfo } from "@services/chat/runtime/QueuedUserMessage.js";
import {
  hasPersistedAssistantSteps,
  pickLastSuccessfulChatSendText,
} from "@services/chat/runtime/UserVisibleText.js";
import { buildExecuteInputText } from "./Helpers.js";

/**
 * 在指定 session 中执行一轮请求。
 *
 * 说明（中文）
 * - 若 `sessionId` 能解析为 chat 分发目标，则改为入 chat queue。
 * - 否则按普通 session 同步执行。
 */
export async function executeBySessionId(params: {
  runtime: RuntimeState;
  serviceRuntime: ServiceRuntime;
  sessionId: string;
  instructions: string;
  attachments?: DashboardSessionExecuteAttachmentInput[];
}) {
  const contextId = String(params.sessionId || "").trim();
  const instructions = String(params.instructions || "").trim();
  if (!contextId) throw new Error("Missing sessionId");
  if (!instructions) throw new Error("Missing instructions");

  const executeInput = await buildExecuteInputText({
    projectRoot: params.runtime.rootPath,
    sessionId: contextId,
    instructions,
    attachments: params.attachments,
  });

  const dispatchTarget = await resolveDispatchTargetByChatKey({
    context: params.serviceRuntime,
    chatKey: contextId,
  });
  if (dispatchTarget) {
    const queuedText = buildQueuedUserMessageWithInfo({
      messageId: dispatchTarget.messageId,
      text: executeInput,
    });
    const ingressExtra: JsonObject = {
      source: "tui_context_execute",
      ingressKind: "exec",
      trigger: "api_execute",
    };

    try {
      await appendExecIngress({
        context: params.serviceRuntime,
        sessionId: contextId,
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
      params.runtime.logger.warn("Dashboard execute ingress append failed", {
        contextId,
        error: String(error),
      });
    }

    const enqueueResult = enqueueChatQueue({
      kind: "exec",
      channel: dispatchTarget.channel,
      targetId: dispatchTarget.chatId,
      contextId,
      text: queuedText,
      ...(dispatchTarget.chatType ? { targetType: dispatchTarget.chatType } : {}),
      ...(typeof dispatchTarget.messageThreadId === "number"
        ? { threadId: dispatchTarget.messageThreadId }
        : {}),
      ...(dispatchTarget.messageId ? { messageId: dispatchTarget.messageId } : {}),
      contextPersisted: true,
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

  await params.runtime.sessionManager.appendUserMessage({
    contextId,
    text: executeInput,
  });

  const result = await params.runtime.sessionManager.run({
    contextId,
    query: executeInput,
  });

  const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage).trim();
  try {
    if (!hasPersistedAssistantSteps(result.assistantMessage)) {
      await params.runtime.sessionManager.appendAssistantMessage({
        contextId,
        message: result.assistantMessage,
        fallbackText: userVisible,
        extra: {
          via: "tui_context_execute",
          note: "assistant_message_missing",
        },
      });
    }
    const deferredInjectedMessages = drainDeferredPersistedUserMessages(
      contextId,
    );
    for (const message of deferredInjectedMessages) {
      await params.runtime.sessionManager.appendUserMessage({
        contextId,
        message,
      });
    }
  } catch {
    // ignore
  }

  return {
    ...result,
    userVisible,
    queued: false,
  };
}
