/**
 * ChatChannelLifecycle：chat 渠道生命周期模块。
 *
 * 关键点（中文）
 * - 渠道 bot 的创建、启动、停止逻辑统一收敛在这里。
 * - bot 实例状态归属于 ChatService 实例持有的 ChatChannelState。
 * - 本模块不处理 downcity.json 写入，也不负责 action 输入输出包装。
 */

import type { ExecutionContext } from "@/types/ExecutionContext.js";
import type { ChatChannelState } from "@/types/ChatRuntime.js";
import type { ChatChannelName } from "@services/chat/types/ChannelStatus.js";
import { createTelegramBot } from "@services/chat/channels/telegram/Bot.js";
import { createFeishuBot } from "@services/chat/channels/feishu/Feishu.js";
import { createQQBot } from "@services/chat/channels/qq/QQ.js";
import { resolveChannelAccount, resolveTargetChannels } from "./ChatChannelCore.js";

async function startTelegramChannel(
  state: ChatChannelState,
  context: ExecutionContext,
): Promise<void> {
  if (!context.config.services?.chat?.channels?.telegram?.enabled) return;
  context.logger.info("Telegram channel enabled");
  const account = resolveChannelAccount(context, "telegram");
  const token = String(account?.botToken || "").trim();
  if (!token) return;
  state.telegram = createTelegramBot(
    {
      enabled: true,
      botToken: token,
    },
    context,
  );
  if (state.telegram) {
    await state.telegram.start();
  }
}

async function startFeishuChannel(
  state: ChatChannelState,
  context: ExecutionContext,
): Promise<void> {
  if (!context.config.services?.chat?.channels?.feishu?.enabled) return;
  context.logger.info("Feishu channel enabled");
  const account = resolveChannelAccount(context, "feishu");
  const appId = String(account?.appId || "").trim();
  const appSecret = String(account?.appSecret || "").trim();
  if (!appId || !appSecret) return;
  state.feishu = await createFeishuBot(
    {
      enabled: true,
      appId,
      appSecret,
      domain: String(account?.domain || "").trim() || "https://open.feishu.cn",
    },
    context,
  );
  if (state.feishu) {
    await state.feishu.start();
  }
}

async function startQQChannel(
  state: ChatChannelState,
  context: ExecutionContext,
): Promise<void> {
  if (!context.config.services?.chat?.channels?.qq?.enabled) return;
  context.logger.info("QQ channel enabled");
  const account = resolveChannelAccount(context, "qq");
  const appId = String(account?.appId || "").trim();
  const appSecret = String(account?.appSecret || "").trim();
  if (!appId || !appSecret) return;
  state.qq = await createQQBot(
    {
      enabled: true,
      appId,
      appSecret,
      sandbox: account?.sandbox === true,
    },
    context,
  );
  if (state.qq) {
    await state.qq.start();
  }
}

/**
 * 启动单个渠道。
 */
export async function startSingleChatChannel(
  state: ChatChannelState,
  context: ExecutionContext,
  channel: ChatChannelName,
): Promise<void> {
  if (channel === "telegram") {
    await startTelegramChannel(state, context);
    return;
  }
  if (channel === "feishu") {
    await startFeishuChannel(state, context);
    return;
  }
  await startQQChannel(state, context);
}

/**
 * 停止单个渠道。
 */
export async function stopSingleChatChannel(
  state: ChatChannelState,
  channel: ChatChannelName,
): Promise<void> {
  if (channel === "telegram" && state.telegram) {
    const bot = state.telegram;
    state.telegram = null;
    await bot.stop();
    return;
  }
  if (channel === "feishu" && state.feishu) {
    const bot = state.feishu;
    state.feishu = null;
    await bot.stop();
    return;
  }
  if (channel === "qq" && state.qq) {
    const bot = state.qq;
    state.qq = null;
    await bot.stop();
  }
}

/**
 * 启动全部已启用的 chat 渠道。
 */
export async function startChatChannels(
  state: ChatChannelState,
  context: ExecutionContext,
): Promise<void> {
  if (state.telegram || state.feishu || state.qq) {
    await stopChatChannels(state);
  }
  for (const channel of resolveTargetChannels()) {
    await startSingleChatChannel(state, context, channel);
  }
}

/**
 * 停止全部 chat 渠道。
 */
export async function stopChatChannels(state: ChatChannelState): Promise<void> {
  const current = { ...state };
  state.telegram = null;
  state.feishu = null;
  state.qq = null;

  if (current.telegram) {
    await current.telegram.stop();
  }
  if (current.feishu) {
    await current.feishu.stop();
  }
  if (current.qq) {
    await current.qq.stop();
  }
}
