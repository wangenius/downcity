/**
 * Chat 渠道配置描述器注册表。
 *
 * 关键点（中文）
 * - 统一管理各 channel 的 Configuration 实例，避免业务侧散落 import。
 * - 提供按渠道查询与全量枚举能力，便于 Console / DB 复用。
 */

import { TelegramChannelConfiguration } from "@services/chat/channels/telegram/Configuration.js";
import { FeishuChannelConfiguration } from "@services/chat/channels/feishu/Configuration.js";
import { QqChannelConfiguration } from "@services/chat/channels/qq/Configuration.js";
import type { ChatChannelConfiguration } from "@services/chat/channels/Configuration.js";
import type { ChatChannelName } from "@services/chat/types/ChannelStatus.js";

const TELEGRAM_CONFIGURATION = new TelegramChannelConfiguration();
const FEISHU_CONFIGURATION = new FeishuChannelConfiguration();
const QQ_CONFIGURATION = new QqChannelConfiguration();

const CHANNEL_CONFIGURATION_REGISTRY: Record<
  ChatChannelName,
  ChatChannelConfiguration
> = {
  telegram: TELEGRAM_CONFIGURATION,
  feishu: FEISHU_CONFIGURATION,
  qq: QQ_CONFIGURATION,
};

/**
 * 按渠道读取配置描述器。
 */
export function getChatChannelConfiguration(
  channel: ChatChannelName,
): ChatChannelConfiguration {
  return CHANNEL_CONFIGURATION_REGISTRY[channel];
}

/**
 * 枚举所有渠道配置描述器。
 */
export function listChatChannelConfigurations(): ChatChannelConfiguration[] {
  return Object.values(CHANNEL_CONFIGURATION_REGISTRY);
}

