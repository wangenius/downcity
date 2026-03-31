/**
 * ChatRuntime 类型定义。
 *
 * 关键点（中文）
 * - 这些类型描述 chat service 的实例级运行态。
 * - channel bots 的状态所有权归属于 ChatService 实例，而不是模块级单例。
 */

import type { FeishuBot } from "@services/chat/channels/feishu/Feishu.js";
import type { QQBot } from "@services/chat/channels/qq/QQ.js";
import type { TelegramBot } from "@services/chat/channels/telegram/Bot.js";

/**
 * ChatService 实例持有的渠道状态。
 */
export type ChatChannelState = {
  /**
   * Telegram 渠道 bot 实例。
   */
  telegram: TelegramBot | null;
  /**
   * Feishu 渠道 bot 实例。
   */
  feishu: FeishuBot | null;
  /**
   * QQ 渠道 bot 实例。
   */
  qq: QQBot | null;
};
