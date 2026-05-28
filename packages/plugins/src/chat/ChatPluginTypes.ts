/**
 * ChatPlugin SDK / runtime 配置类型。
 *
 * 关键点（中文）
 * - 这里定义 `new ChatPlugin({...})` 的显式注入接口。
 * - 构造参数只承载显式渠道配置与 queue 行为，不再承载自定义存储/解析器注入。
 * - 若未显式提供渠道凭据，ChatPlugin 会直接回退到默认全局账号池 `~/.downcity/downcity.db`。
 */

import type { ChatQueueWorkerConfig } from "@/chat/types/ChatQueueWorker.js";

/**
 * Telegram 显式渠道配置。
 */
export interface ChatPluginTelegramOptions {
  /**
   * 是否启用当前渠道。
   *
   * 说明（中文）
   * - 省略时，若显式提供了 `botToken`，默认视为启用。
   * - 传入 `false` 时会强制关闭，即使提供了凭据也不会启动。
   */
  enabled?: boolean;
  /**
   * Telegram Bot Token。
   */
  botToken: string;
  /**
   * 可选的显式账户 ID。
   *
   * 说明（中文）
   * - 主要用于让上层产品把 runtime 渠道与自己的 account 池关联起来。
   * - 省略时会使用 runtime 合成的临时 ID。
   */
  channelAccountId?: string;
  /**
   * 渠道展示名。
   */
  name?: string;
}

/**
 * Feishu 显式渠道配置。
 */
export interface ChatPluginFeishuOptions {
  /**
   * 是否启用当前渠道。
   */
  enabled?: boolean;
  /**
   * Feishu / Lark App ID。
   */
  appId: string;
  /**
   * Feishu / Lark App Secret。
   */
  appSecret: string;
  /**
   * 可选的 Open API 域名。
   */
  domain?: string;
  /**
   * 可选的显式账户 ID。
   */
  channelAccountId?: string;
  /**
   * 渠道展示名。
   */
  name?: string;
}

/**
 * QQ 显式渠道配置。
 */
export interface ChatPluginQqOptions {
  /**
   * 是否启用当前渠道。
   */
  enabled?: boolean;
  /**
   * QQ Bot App ID。
   */
  appId: string;
  /**
   * QQ Bot App Secret。
   */
  appSecret: string;
  /**
   * 是否使用 QQ 沙箱模式。
   */
  sandbox?: boolean;
  /**
   * 可选的显式账户 ID。
   */
  channelAccountId?: string;
  /**
   * 渠道展示名。
   */
  name?: string;
}

/**
 * ChatPlugin 显式构造参数。
 */
export interface ChatPluginOptions {
  /**
   * Chat queue worker 运行配置。
   *
   * 说明（中文）
   * - 显式传入时优先级高于 `downcity.json.plugins.chat.queue`。
   * - 可用于不同 client 定制并发、突发合并等行为。
   */
  queue?: Partial<ChatQueueWorkerConfig>;
  /**
   * Telegram 渠道显式配置。
   */
  telegram?: ChatPluginTelegramOptions;
  /**
   * Feishu 渠道显式配置。
   */
  feishu?: ChatPluginFeishuOptions;
  /**
   * QQ 渠道显式配置。
   */
  qq?: ChatPluginQqOptions;
}
