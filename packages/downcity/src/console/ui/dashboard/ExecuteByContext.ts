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
import type { DashboardContextExecuteAttachmentInput } from "@/types/DashboardContextExecute.js";
import { drainDeferredPersistedUserMessages } from "@agent/context/manager/RequestContext.js";
import { enqueueChatQueue } from "@services/chat/runtime/ChatQueue.js";
import { resolveDispatchTargetByChatKey } from "@services/chat/runtime/ChatkeySend.js";
import { appendExecIngress } from "@services/chat/runtime/ChatIngressStore.js";
import { buildQueuedUserMessageWithInfo } from "@services/chat/runtime/QueuedUserMessage.js";
import { pickLastSuccessfulChatSendText } from "@services/chat/runtime/UserVisibleText.js";
import { buildExecuteInputText } from "./Helpers.js";

/**
 * 在指定 context 中执行一轮请求。
 *
 * 说明（中文）
 * - 若 `contextId` 能解析为 chat 分发目标，则改为入 chat queue。
 * - 否则按普通 context 同步执行。
 */
export async function executeByContextId(params: {
  runtime: RuntimeState;
  serviceRuntime: ServiceRuntime;
  contextId: string;
  instructions: string;
  attachments?: DashboardContextExecuteAttachmentInput[];
}) {
  const contextId = String(params.contextId || "").trim();
  const instructions = String(params.instructions || "").trim();
  if (!contextId) throw new Error("Missing contextId");
  if (!instructions) throw new Error("Missing instructions");

  const executeInput = await buildExecuteInputText({
    projectRoot: params.runtime.rootPath,
    contextId,
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
        contextId,
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

  await params.runtime.contextManager.appendUserMessage({
    contextId,
    text: executeInput,
  });

  const result = await params.runtime.contextManager.run({
    contextId,
    query: executeInput,
  });

  const userVisible = pickLastSuccessfulChatSendText(result.assistantMessage).trim();
  try {
    await params.runtime.contextManager.appendAssistantMessage({
      contextId,
      message: result.assistantMessage,
      fallbackText: userVisible,
      extra: {
        via: "tui_context_execute",
        note: "assistant_message_missing",
      },
    });
    const deferredInjectedMessages = drainDeferredPersistedUserMessages(
      contextId,
    );
    for (const message of deferredInjectedMessages) {
      await params.runtime.contextManager.appendUserMessage({
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
