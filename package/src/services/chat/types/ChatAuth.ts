/**
 * ChatAuth 类型定义。
 *
 * 关键点（中文）
 * - 统一描述“主人（master）鉴权”判定入参与结果。
 * - 由 chat channels 与 auth runtime 共享，避免平台侧重复定义。
 */

import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

/**
 * 按渠道维护的主人鉴权 ID。
 */
export type ChatMasterAuthIdMap = {
  /**
   * Telegram 主人鉴权 ID（对应 Telegram `from.id`）。
   */
  telegram?: string;
  /**
   * Feishu 主人鉴权 ID（对应事件中的发送者 ID）。
   */
  feishu?: string;
  /**
   * QQ 主人鉴权 ID（对应事件中的发送者 ID）。
   */
  qq?: string;
};

/**
 * 主人身份判定输入参数。
 */
export type ChatMasterMatchParams = {
  /**
   * 当前消息来源渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * 当前消息发送者用户 ID（字符串形式）。
   */
  userId?: string;
};

/**
 * 主人身份状态。
 *
 * 含义（中文）
 * - `master`：明确命中主人白名单。
 * - `guest`：明确不在主人白名单中。
 * - `unknown`：无法判定（如缺少 userId 或未配置白名单）。
 */
export type ChatMasterStatus = "master" | "guest" | "unknown";
