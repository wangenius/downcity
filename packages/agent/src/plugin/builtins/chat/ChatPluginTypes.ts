/**
 * ChatPlugin SDK / runtime 配置类型。
 *
 * 关键点（中文）
 * - 这里定义 `new ChatPlugin({...})` 的显式注入接口。
 * - 目标是让 `city`、`vibecape` 等上层产品通过构造参数提供渠道凭据与账户解析能力。
 * - 若未显式注入，则 ChatPlugin 仍可回退到现有 `downcity.json + PlatformStore` 读取路径。
 */

import type { AgentContext } from "@/types/runtime/agent/AgentContext.js";
import type { ChatQueueWorkerConfig } from "@/plugin/builtins/chat/types/ChatQueueWorker.js";
import type { StoredChannelAccount } from "@/types/runtime/host/Store.js";
import type { ChatChannelName } from "@/plugin/builtins/chat/types/ChannelStatus.js";

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
 * Chat 渠道账户解析提供器。
 */
export interface ChatPluginChannelAccountProvider {
  /**
   * 按渠道解析当前应使用的账户。
   *
   * 说明（中文）
   * - 返回值需要已经包含解密后的凭据。
   * - 该接口使用同步返回，确保 chat runtime 中的同步读取点不需要重写为 async。
   */
  getChannelAccount(params: {
    /**
     * 当前请求的渠道名。
     */
    channel: ChatChannelName;
    /**
     * 当前 Agent 上下文。
     */
    context: AgentContext;
    /**
     * 可选的显式账户 ID。
     */
    channelAccountId?: string;
  }): StoredChannelAccount | null;
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
  /**
   * 渠道账户解析提供器。
   *
   * 说明（中文）
   * - 当 client 已经维护自己的 account 池时，应优先注入这个 provider。
   * - 若同时显式提供了渠道凭据，则显式凭据优先，provider 作为回退。
   */
  channelAccounts?: ChatPluginChannelAccountProvider;
}
