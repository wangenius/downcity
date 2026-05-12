/**
 * ChatChannelCore：chat 渠道状态的核心共享辅助模块。
 *
 * 关键点（中文）
 * - 这里只放最基础的渠道状态/名称/account 解析能力。
 * - 生命周期、配置写入、action 执行分别放到更细的模块中。
 * - 目标是让 chat channel 子模块共享同一套最小公共基元。
 */

import { ConsoleStore } from "@/shared/utils/store/index.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import type { StoredChannelAccount } from "@/shared/types/Store.js";
import type { ChatChannelName } from "@services/chat/types/ChannelStatus.js";
import type { ChatChannelState } from "@/shared/types/ChatRuntime.js";

const CHAT_CHANNEL_NAMES: ChatChannelName[] = ["telegram", "feishu", "qq"];

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
  const config = context.config.services?.chat?.channels?.[channel] as
    | { channelAccountId?: unknown }
    | undefined;
  return String(config?.channelAccountId || "").trim();
}

/**
 * 从 ConsoleStore 中解析渠道 account。
 */
export function resolveChannelAccount(
  context: AgentContext,
  channel: ChatChannelName,
): StoredChannelAccount | null {
  const channelAccountId = resolveChannelAccountId(context, channel);
  if (!channelAccountId) return null;
  const store = new ConsoleStore();
  try {
    const account = store.getChannelAccountSync(channelAccountId);
    if (!account) return null;
    if (account.channel !== channel) return null;
    return account;
  } catch {
    return null;
  } finally {
    store.close();
  }
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
