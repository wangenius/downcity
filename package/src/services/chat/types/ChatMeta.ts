/**
 * ChatMeta：chat 服务维护的 context 路由元信息。
 *
 * 关键点（中文）
 * - 只描述“如何把 contextId 路由回平台 chat”
 * - 由 services/chat 在接收入站消息时更新
 * - 不属于 core context message schema
 */

import type { ChatDispatchChannel } from "./ChatDispatcher.js";

export type ChatMetaV1 = {
  /** schema 版本 */
  v: 1;
  /** 更新时间戳（ms） */
  updatedAt: number;
  /** 会话 ID */
  contextId: string;
  /** 平台通道 */
  channel: ChatDispatchChannel;
  /** 平台 chatId */
  chatId: string;
  /** 平台 chatType（group/private/topic/c2c/channel...） */
  targetType?: string;
  /** 平台 thread/topic ID */
  threadId?: number;
  /** 平台最近消息 ID（QQ/部分平台回包依赖） */
  messageId?: string;
  /** 最近发言用户 ID */
  actorId?: string;
  /** 最近发言用户昵称 */
  actorName?: string;
};
