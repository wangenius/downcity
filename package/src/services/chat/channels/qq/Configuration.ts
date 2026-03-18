/**
 * QQ 渠道配置描述。
 *
 * 关键点（中文）
 * - ship 层只保留 `enabled` 与 `channelAccountId`。
 * - QQ 专属参数（sandbox 等）在 channel account 中维护。
 */

import { ChatChannelConfiguration } from "@services/chat/channels/Configuration.js";
import type { ChatChannelConfigurationDescriptor } from "@services/chat/types/ChannelConfiguration.js";

/**
 * QQ 渠道配置描述器。
 */
export class QqChannelConfiguration extends ChatChannelConfiguration {
  readonly channel = "qq" as const;

  describe(): ChatChannelConfigurationDescriptor {
    return {
      channel: this.channel,
      title: "QQ Channel Configuration",
      description:
        "Bind a QQ channel account and control runtime enable/disable state.",
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
            description: "Whether qq channel should be started by runtime.",
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
            label: "Channel Account ID",
            description:
              "Bind channel to a channel account row in ~/.ship/ship.db channel_accounts.",
            type: "string",
            source: "ship_json",
            required: false,
            nullable: true,
            writable: true,
            restartRequired: true,
            example: "qq-main",
          },
        ],
        channelAccount: [],
        envFallback: [],
      },
    };
  }
}
