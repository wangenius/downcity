/**
 * ChatChannelCore：chat 渠道状态的核心共享辅助模块。
 *
 * 关键点（中文）
 * - 这里只放最基础的渠道状态/名称/account 解析能力。
 * - 生命周期、配置写入、action 执行分别放到更细的模块中。
 * - 目标是让 chat channel 子模块共享同一套最小公共基元。
 */

import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { StoredChannelAccount } from "@downcity/agent/internal/types/platform/Store.js";
import type { ChatChannelName } from "@/chat/types/ChannelStatus.js";
import type { ChatChannelState } from "@/chat/types/ChatRuntime.js";
import { getStoredChannelAccountSync } from "@/chat/accounts/Store.js";

const CHAT_CHANNEL_NAMES: ChatChannelName[] = ["telegram", "feishu", "qq"];

type ChatRuntimeBindings = {
  getChannelAccountId?(context: AgentContext, channel: ChatChannelName): string;
  resolveChannelAccount?(
    context: AgentContext,
    channel: ChatChannelName,
  ): StoredChannelAccount | null;
  isChannelEnabled?(context: AgentContext, channel: ChatChannelName): boolean;
};

function resolveChatPluginBindings(
  context: AgentContext,
): ChatRuntimeBindings | null {
  const candidate = context.agent?.pluginInstances?.get?.("chat") as
    | ChatRuntimeBindings
    | undefined;
  return candidate || null;
}

/**
 * 创建 chat 渠道状态对象。
 */
export function createChatChannelState(): ChatChannelState {
  return {
    telegram: null,
    feishu: null,
    qq: null,
  };
}

/**
 * 解析并校验渠道名。
 */
export function resolveChatChannelNameOrThrow(value: string): ChatChannelName {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "telegram" ||
    normalized === "feishu" ||
    normalized === "qq"
  ) {
    return normalized;
  }
  throw new Error(`Invalid channel: ${value}. Use telegram|feishu|qq.`);
}

/**
 * 解析目标渠道列表。
 */
export function resolveTargetChannels(channel?: ChatChannelName): ChatChannelName[] {
  return channel ? [channel] : [...CHAT_CHANNEL_NAMES];
}

/**
 * 读取渠道绑定的 bot account id。
 */
export function resolveChannelAccountId(
  context: AgentContext,
  channel: ChatChannelName,
): string {
  const plugin = resolveChatPluginBindings(context);
  const explicit = String(plugin?.getChannelAccountId?.(context, channel) || "").trim();
  if (explicit) return explicit;
  const config = context.config.plugins?.chat?.channels?.[channel] as
    | { channelAccountId?: unknown }
    | undefined;
  return String(config?.channelAccountId || "").trim();
}

/**
 * 解析渠道 account。
 *
 * 关键点（中文）
 * - 优先使用 ChatPlugin 实例上的显式解析逻辑。
 * - 若未命中，再回退到默认全局账号池 `~/.downcity/downcity.db`。
 */
export function resolveChannelAccount(
  context: AgentContext,
  channel: ChatChannelName,
): StoredChannelAccount | null {
  const plugin = resolveChatPluginBindings(context);
  const explicit = plugin?.resolveChannelAccount?.(context, channel);
  if (explicit) return explicit;
  const channelAccountId = resolveChannelAccountId(context, channel);
  const account = channelAccountId
    ? getStoredChannelAccountSync(channelAccountId)
    : null;
  if (!account) return null;
  if (account.channel !== channel) return null;
  return account;
}

/**
 * 判断渠道 credentials 是否已经配置完整。
 */
export function isChannelAccountConfigured(
  channel: ChatChannelName,
  account: StoredChannelAccount | null,
): boolean {
  if (!account) return false;
  if (channel === "telegram") {
    return !!String(account.botToken || "").trim();
  }
  return !!String(account.appId || "").trim() && !!String(account.appSecret || "").trim();
}

/**
 * 判断指定渠道当前是否启用。
 */
export function isChatChannelEnabled(
  context: AgentContext,
  channel: ChatChannelName,
): boolean {
  const plugin = resolveChatPluginBindings(context);
  if (typeof plugin?.isChannelEnabled === "function") {
    return plugin.isChannelEnabled(context, channel);
  }
  return context.config.plugins?.chat?.channels?.[channel]?.enabled === true;
}

/**
 * 读取当前渠道 bot 实例。
 */
export function getChatChannelBot(
  state: ChatChannelState,
  channel: ChatChannelName,
) {
  if (channel === "telegram") return state.telegram;
  if (channel === "feishu") return state.feishu;
  return state.qq;
}
