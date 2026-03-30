/**
 * ChatQueue 共享门面。
 *
 * 关键点（中文）
 * - 迁移阶段保留旧函数式 API，内部委托给共享 `ChatQueueStore`。
 * - 新代码应优先通过 `ChatQueueStore` 实例或 `resolveChatQueueStore(runtime)` 使用队列。
 */

import type {
  ChatQueueEnqueueParams,
  ChatQueueEnqueueResult,
  ChatQueueItem,
} from "@services/chat/types/ChatQueue.js";
import {
  ChatQueueStore,
  getSharedChatQueueStore,
  resolveChatQueueStore,
  type ChatQueueEnqueueListener,
  type ChatQueueStorePort,
} from "./ChatQueueStore.js";

export { ChatQueueStore, getSharedChatQueueStore, resolveChatQueueStore };
export type { ChatQueueEnqueueListener, ChatQueueStorePort };

/**
 * 订阅共享 queue 的入队事件。
 */
export function onChatQueueEnqueue(listener: ChatQueueEnqueueListener): () => void {
  return getSharedChatQueueStore().onEnqueue(listener);
}

/**
 * 向共享 queue 入队。
 */
export function enqueueChatQueue(
  params: ChatQueueEnqueueParams,
): ChatQueueEnqueueResult {
  return getSharedChatQueueStore().enqueue(params);
}

/**
 * 从共享 queue 弹出一条消息。
 */
export function shiftChatQueueItem(laneKey: string): ChatQueueItem | null {
  return getSharedChatQueueStore().shift(laneKey);
}

/**
 * 从共享 queue drain 某个 lane。
 */
export function drainChatQueueLane(
  laneKey: string,
  maxItems?: number,
): ChatQueueItem[] {
  return getSharedChatQueueStore().drain(laneKey, maxItems);
}

/**
 * 列出共享 queue 当前积压的 lane keys。
 */
export function listChatQueueLanes(): string[] {
  return getSharedChatQueueStore().listLanes();
}

/**
 * 查询共享 queue 某个 lane 的长度。
 */
export function getChatQueueLaneSize(laneKey: string): number {
  return getSharedChatQueueStore().getLaneSize(laneKey);
}

/**
 * 清空共享 queue 某个 lane。
 */
export function clearChatQueueLane(laneKey: string): void {
  getSharedChatQueueStore().clear(laneKey);
}
