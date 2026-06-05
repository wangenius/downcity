/**
 * Telegram 渠道配置描述。
 *
 * 关键点（中文）
 * - ship 层只绑定 `enabled` 与 `channelAccountId`。
 * - 真实密钥由 chat account 统一托管。
 */

import { ChatChannelConfiguration } from "@/chat/channels/Configuration.js";
import type { ChatChannelConfigurationDescriptor } from "@/chat/types/ChannelConfiguration.js";

/**
 * Telegram 渠道配置描述器。
 */
export class TelegramChannelConfiguration extends ChatChannelConfiguration {
  readonly channel = "telegram" as const;

  describe(): ChatChannelConfigurationDescriptor {
    return {
      channel: this.channel,
      title: "Telegram Chat Platform Configuration",
      description:
        "Bind a Telegram chat account and control runtime enable/disable state.",
      version: "1.0.0",
      capabilities: {
        canToggleEnabled: true,
        canBindChannelAccount: true,
        canConfigure: true,
      },
      fields: {
        ship: [
          {
            key: "enabled",
            label: "Enabled",
            description:
              "Whether telegram channel should be started by runtime.",
            type: "boolean",
            source: "ship_json",
            required: false,
            nullable: false,
            writable: true,
            restartRequired: true,
            defaultValue: false,
            example: true,
          },
          {
            key: "channelAccountId",
            label: "Chat Account ID",
            description:
              "Bind this chat platform to a chat account row in ~/.downcity/downcity.db channel_accounts.",
            type: "string",
            source: "ship_json",
            required: false,
            nullable: true,
            writable: true,
            restartRequired: true,
            example: "telegram-main",
          },
        ],
        channelAccount: [],
        envFallback: [],
      },
    };
  }
}
