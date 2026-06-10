/**
 * ChatPlugin SDK / runtime 配置类型。
 *
 * 关键点（中文）
 * - ChatPlugin 只接收 queue 行为与 channels 列表。
 * - 每个 channel 对象自己负责 env / 凭据 / 账号池绑定解析。
 * - 这样 ChatPlugin 不再理解 Telegram、Feishu、QQ 的具体配置字段。
 */

import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { StoredChannelAccount } from "@downcity/agent/internal/types/platform/Store.js";
import type { ChatChannelName } from "@/chat/types/ChannelStatus.js";
import type { ChatQueueWorkerConfig } from "@/chat/types/ChatQueueWorker.js";

/**
 * Chat channel 运行态 patch。
 */
export interface ChatChannelRuntimePatch {
  /**
   * 是否启用该 channel。
   */
  enabled?: boolean;
  /**
   * 绑定的账号池记录 ID。
   *
   * 说明（中文）
   * - 传入字符串表示绑定到该账号池记录。
   * - 传入 `null` 表示清空账号池绑定。
   */
  channelAccountId?: string | null;
}

/**
 * Chat channel 对象协议。
 */
export interface ChatChannel {
  /**
   * channel 名称。
   */
  readonly name: ChatChannelName;
  /**
   * 当前 channel 是否启用。
   */
  isEnabled(context: AgentContext): boolean;
  /**
   * 当前 channel 绑定的账号池记录 ID。
   */
  getChannelAccountId(context: AgentContext): string;
  /**
   * 解析当前 channel 的运行态账号。
   */
  getAccount(context: AgentContext): StoredChannelAccount | null;
  /**
   * 应用运行态配置 patch。
   */
  applyRuntimePatch(patch: ChatChannelRuntimePatch): void;
}

/**
 * ChatPlugin 显式构造参数。
 */
export interface ChatPluginOptions {
  /**
   * Chat queue worker 运行配置。
   *
   * 说明（中文）
   * - 可用于不同 client 定制并发、突发合并等行为。
   * - 这是 queue 行为的唯一运行配置入口。
   */
  queue?: Partial<ChatQueueWorkerConfig>;
  /**
   * 当前 agent 持有的 chat channels。
   *
   * 说明（中文）
   * - 每个 channel 对象自己负责 env、凭据与账号池绑定解析。
   * - 未传入时不启用任何 chat channel。
   */
  channels?: ChatChannel[];
}
