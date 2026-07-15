/**
 * Chat 渠道配置描述器基类。
 *
 * 关键点（中文）
 * - 每个 channel 继承该基类，集中声明自己的配置字段。
 * - 统一提供“可写 Agent 配置字段”提取逻辑，避免在 service 中重复硬编码。
 */

import type {
  ChatChannelConfigurationDescriptor,
  ChatChannelConfigurationField,
} from "@/chat/types/ChannelConfiguration.js";
import type { ChatChannelName } from "@/chat/types/ChannelStatus.js";

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
   * 返回允许上游产品编辑的 Agent 配置字段定义。
   */
  get_writable_agent_config_fields(): ChatChannelConfigurationField[] {
    return this.describe().fields.agent_config.filter((field) => field.writable);
  }
}
