/**
 * ChatQueue 类型定义。
 *
 * 关键点（中文）
 * - 描述 chat 队列的数据结构与入队协议
 * - 供 services 与 process 统一复用
 */

import type { JsonObject } from "@/shared/types/Json.js";

export type ChatQueueItemKind = "exec" | "audit" | "control";

export type ChatQueueControl = {
  type: "clear";
};

export type ChatQueueItem = {
  id: string;
  enqueuedAt: number;
  kind: ChatQueueItemKind;
  channel: "telegram" | "feishu" | "qq";
  targetId: string;
  sessionId: string;
  text: string;
  targetType?: string;
  threadId?: number;
  messageId?: string;
  actorId?: string;
  actorName?: string;
  /**
   * 该消息是否已在 ingress 边界写入 session messages。
   *
   * 关键点（中文）
   * - 为 true 时，queue worker 不再重复补写
   * - 允许历史入口继续依赖 worker 的兜底写入逻辑
   */
  sessionPersisted?: boolean;
  extra?: JsonObject;
  control?: ChatQueueControl;
};

export type ChatQueueEnqueueParams = Omit<ChatQueueItem, "id" | "enqueuedAt"> & {
  kind?: ChatQueueItemKind;
};

export type ChatQueueEnqueueResult = {
  lanePosition: number;
  itemId: string;
};
