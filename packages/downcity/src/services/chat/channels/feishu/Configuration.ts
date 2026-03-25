/**
 * Feishu 渠道配置描述。
 *
 * 关键点（中文）
 * - ship 层只保留绑定字段。
 * - appId/appSecret/domain 由 channel account 维护。
 */

import { ChatChannelConfiguration } from "@services/chat/channels/Configuration.js";
import type { ChatChannelConfigurationDescriptor } from "@services/chat/types/ChannelConfiguration.js";

/**
 * Feishu 渠道配置描述器。
 */
export class FeishuChannelConfiguration extends ChatChannelConfiguration {
  readonly channel = "feishu" as const;

  describe(): ChatChannelConfigurationDescriptor {
    return {
      channel: this.channel,
      title: "Feishu Channel Configuration",
      description:
        "Bind a Feishu/Lark channel account and control runtime enable/disable state.",
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
              "Whether feishu channel should be started by runtime.",
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
              "Bind channel to a channel account row in ~/.downcity/downcity.db channel_accounts.",
            type: "string",
            source: "ship_json",
            required: false,
            nullable: true,
            writable: true,
            restartRequired: true,
            example: "feishu-main",
          },
        ],
        channelAccount: [],
        envFallback: [],
      },
    };
  }
}
