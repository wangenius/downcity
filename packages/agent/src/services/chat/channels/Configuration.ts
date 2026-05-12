/**
 * Chat 渠道配置描述器基类。
 *
 * 关键点（中文）
 * - 每个 channel 继承该基类，集中声明自己的配置字段。
 * - 统一提供“可写 ship 字段”提取逻辑，避免在 service 中重复硬编码。
 */

import type {
  ChatChannelConfigurationDescriptor,
  ChatChannelConfigurationField,
} from "@services/chat/types/ChannelConfiguration.js";
import type { ChatChannelName } from "@services/chat/types/ChannelStatus.js";

/**
 * Chat 渠道配置描述器抽象基类。
 */
export abstract class ChatChannelConfiguration {
  /**
   * 绑定渠道名。
   */
  abstract readonly channel: ChatChannelName;

  /**
   * 返回完整配置描述。
   */
  abstract describe(): ChatChannelConfigurationDescriptor;

  /**
   * 返回可通过 `chat.configure` 写入的 downcity.json 字段定义。
   */
  getWritableShipFields(): ChatChannelConfigurationField[] {
    return this.describe().fields.ship.filter((field) => field.writable);
  }
}
