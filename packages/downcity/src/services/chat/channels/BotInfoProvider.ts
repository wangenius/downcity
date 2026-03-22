/**
 * Chat 渠道 Bot 信息探测器注册表。
 *
 * 关键点（中文）
 * - 将不同渠道的 bot 信息探测实现统一抽象为 provider。
 * - 业务层只依赖注册表，不直接写渠道分支。
 */

import { FeishuBotInfoProvider } from "@services/chat/channels/feishu/BotInfo.js";
import { QqBotInfoProvider } from "@services/chat/channels/qq/BotInfo.js";
import { TelegramBotInfoProvider } from "@services/chat/channels/telegram/BotInfo.js";
import type {
  ChatBotInfoResolveInput,
  ChatBotInfoResult,
  ChatChannelBotInfoProvider,
} from "@services/chat/types/BotInfo.js";
import type { ChatChannelName } from "@services/chat/types/ChannelStatus.js";

const TELEGRAM_BOT_INFO_PROVIDER = new TelegramBotInfoProvider();
const FEISHU_BOT_INFO_PROVIDER = new FeishuBotInfoProvider();
const QQ_BOT_INFO_PROVIDER = new QqBotInfoProvider();

const CHAT_CHANNEL_BOT_INFO_PROVIDER_REGISTRY: Record<
  ChatChannelName,
  ChatChannelBotInfoProvider
> = {
  telegram: TELEGRAM_BOT_INFO_PROVIDER,
  feishu: FEISHU_BOT_INFO_PROVIDER,
  qq: QQ_BOT_INFO_PROVIDER,
};

/**
 * 获取指定渠道的 Bot 信息探测器。
 */
export function getChatChannelBotInfoProvider(
  channel: ChatChannelName,
): ChatChannelBotInfoProvider {
  return CHAT_CHANNEL_BOT_INFO_PROVIDER_REGISTRY[channel];
}

/**
 * 使用统一入口探测 Bot 信息。
 */
export function resolveChatChannelBotInfo(
  input: ChatBotInfoResolveInput,
): Promise<ChatBotInfoResult> {
  const provider = getChatChannelBotInfoProvider(input.channel);
  return provider.resolve(input.credentials);
}
