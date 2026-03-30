/**
 * ChatQueueSessionBridge：chat queue 到 session 的桥接模块。
 *
 * 关键点（中文）
 * - 这里集中处理 queue worker 与 session port 的交互细节。
 * - ChatQueueWorker 负责调度与回发；session 的写入协议收敛到这里。
 * - 这样可以把“队列消费”与“session 持久化/补写”边界拆清楚。
 */

import { drainDeferredPersistedUserMessages } from "@sessions/RequestContext.js";
import type { JsonObject } from "@/types/Json.js";
import type { SessionRunResult } from "@/types/SessionRun.js";
import type { SessionUserMessageV1 } from "@/types/SessionMessage.js";
import type { SessionPort } from "@/types/ExecutionContext.js";
import type { ChatQueueItem } from "@services/chat/types/ChatQueue.js";
import { hasPersistedAssistantSteps } from "./UserVisibleText.js";

/**
 * 判断 queue item 是否需要补写到 session。
 */
export function shouldAppendChatIngressMessage(item: ChatQueueItem): boolean {
  return item.kind === "exec";
}

/**
 * 统一补齐入站消息分类标记。
 *
 * 关键点（中文）
 * - 当前 message history 仅写入 `exec`，所以固定写 `ingressKind=exec`。
 */
export function buildChatIngressExtra(item: ChatQueueItem): JsonObject {
  const base = item.extra && typeof item.extra === "object" ? item.extra : {};
  return {
    ...base,
    ingressKind: "exec",
  };
}

/**
 * 必要时把入站消息补写到 session。
 */
export async function appendChatIngressMessageIfNeeded(params: {
  session: SessionPort;
  item: ChatQueueItem;
}): Promise<void> {
  if (!shouldAppendChatIngressMessage(params.item)) return;
  if (params.item.sessionPersisted === true) return;
  await params.session.appendUserMessage({
    sessionId: params.item.sessionId,
    text: params.item.text,
    extra: buildChatIngressExtra(params.item),
  });
}

/**
 * 把 queue item 转成 step 阶段可并入的 user message。
 */
export function toMergedStepUserMessage(
  item: ChatQueueItem,
): SessionUserMessageV1 | null {
  if (item.kind !== "exec") return null;
  const text = String(item.text ?? "").trim();
  if (!text) return null;
  return {
    id: `u:${item.sessionId}:${item.id}`,
    role: "user",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId: item.sessionId,
      source: "ingress",
      kind: "normal",
      extra: buildChatIngressExtra(item),
    },
    parts: [{ type: "text", text }],
  };
}

/**
 * 在 session 中补写一次运行失败的 assistant 文本。
 */
export async function appendChatRunErrorMessage(params: {
  session: SessionPort;
  sessionId: string;
  text: string;
}): Promise<void> {
  await params.session.appendAssistantMessage({
    sessionId: params.sessionId,
    fallbackText: params.text,
    extra: {
      note: "chat_queue_worker_run_failed",
    },
  });
}

/**
 * 持久化一次 queue run 的 session 结果。
 *
 * 关键点（中文）
 * - 若 assistant step 已经持久化，则这里不再重复补写最终 assistant。
 * - RequestContext 中延后缓存的 user messages 也在这里统一补写。
 */
export async function persistChatRunResult(params: {
  session: SessionPort;
  sessionId: string;
  result: SessionRunResult;
}): Promise<void> {
  if (!hasPersistedAssistantSteps(params.result.assistantMessage)) {
    await params.session.appendAssistantMessage({
      sessionId: params.sessionId,
      message: params.result.assistantMessage,
    });
  }

  const deferredInjectedMessages = drainDeferredPersistedUserMessages(
    params.sessionId,
  );
  for (const message of deferredInjectedMessages) {
    await params.session.appendUserMessage({
      sessionId: params.sessionId,
      message,
    });
  }
}
