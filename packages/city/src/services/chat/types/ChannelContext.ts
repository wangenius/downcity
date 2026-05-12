/**
 * ChannelContext 类型定义。
 *
 * 关键点（中文）
 * - 描述渠道目标（platform target）与内部 sessionId 的映射结构。
 * - 映射由 chat service 维护，sessionId 对外保持稳定但不可推导。
 */

import type { ChatDispatchChannel } from "./ChatDispatcher.js";

/**
 * 渠道目标标识输入。
 */
export type ChannelContextTarget = {
  /**
   * 渠道类型（telegram/feishu/qq）。
   */
  channel: ChatDispatchChannel;
  /**
   * 平台 chat 原始 ID。
   */
  chatId: string;
  /**
   * 平台 chat 类型（如 group/c2c/channel/p2p）。
   */
  targetType?: string;
  /**
   * 平台 thread/topic ID（仅部分渠道存在）。
   */
  threadId?: number;
};

/**
 * `sessionId -> 渠道目标` 路由条目。
 */
export type ChannelContextRouteV1 = {
  /**
   * schema 版本。
   */
  v: 1;
  /**
   * 内部 sessionId（随机生成，不可推导）。
   */
  sessionId: string;
  /**
   * 渠道类型（telegram/feishu/qq）。
   */
  channel: ChatDispatchChannel;
  /**
   * 平台 chat 原始 ID。
   */
  chatId: string;
  /**
   * 平台 chat 类型（group/c2c/channel/p2p...）。
   */
  targetType?: string;
  /**
   * 平台 thread/topic ID。
   */
  threadId?: number;
  /**
   * 最近入站/出站相关 messageId（用于回复语义补全）。
   */
  messageId?: string;
  /**
   * 最近触发该会话的用户 ID。
   */
  actorId?: string;
  /**
   * 最近触发该会话的用户名/昵称。
   */
  actorName?: string;
  /**
   * 会话展示名（群名/频道名/私聊对象名）。
   *
   * 说明（中文）
   * - 由各渠道在入站时 best-effort 提供。
   * - 用于 Console 展示，不参与路由键计算。
   */
  chatTitle?: string;
  /**
   * 路由条目更新时间（毫秒时间戳）。
   */
  updatedAt: number;
};

/**
 * Channel 映射文件结构。
 */
export type ChannelContextMetaFileV1 = {
  /**
   * schema 版本。
   */
  v: 1;
  /**
   * 文件更新时间（毫秒时间戳）。
   */
  updatedAt: number;
  /**
   * 目标键 -> sessionId 映射索引。
   *
   * 说明（中文）
   * - 目标键由 `channel/chatId/targetType/threadId` 归一化后拼接。
   */
  sessionIdByTargetKey: Record<string, string>;
  /**
   * sessionId -> 路由信息映射索引。
   */
  routesBySessionId: Record<string, ChannelContextRouteV1>;
};
