/**
 * ChatPlugin：chat plugin 的类实现。
 *
 * 关键点（中文）
 * - chat 的渠道 bot 状态归属于 ChatPlugin 实例。
 * - chat 的 queue worker 也归属于 ChatPlugin 实例，而不是 agent 入口。
 * - Index 只保留静态导出入口，这里承接真正的 plugin class 实现。
 * - action 注册表已经拆到独立模块，当前文件只保留实例骨架。
 */

import type { AgentRuntime } from "@downcity/agent/internal/types/runtime/agent/AgentRuntime.js";
import { BasePlugin } from "@downcity/agent/internal/plugin/core/BasePlugin.js";
import type { PluginActions } from "@downcity/agent/internal/plugin/types/Plugin.js";
import type { AgentContext } from "@downcity/agent/internal/types/runtime/agent/AgentContext.js";
import type { ChatChannelState } from "@/chat/types/ChatRuntime.js";
import type { StoredChannelAccount } from "@downcity/agent/internal/types/platform/Store.js";
import type { ChatQueueWorkerConfig } from "@/chat/types/ChatQueueWorker.js";
import type {
  ChatPluginFeishuOptions,
  ChatPluginOptions,
  ChatPluginQqOptions,
  ChatPluginTelegramOptions,
} from "@/chat/ChatPluginTypes.js";
import type { ChatChannelName } from "@/chat/types/ChannelStatus.js";
import {
  createChatChannelState,
  startChatChannels,
  stopChatChannels,
} from "./runtime/ChatChannelFacade.js";
import { getStoredChannelAccountSync } from "./accounts/Store.js";
import { createChatPluginActions } from "./runtime/ChatPluginActions.js";
import { ChatQueueWorker } from "./runtime/ChatQueueWorker.js";
import { buildChatPluginSystem } from "./runtime/ChatPluginSystem.js";
import { ChatQueueStore } from "./runtime/ChatQueueStore.js";

/**
 * Chat plugin 类实现。
 */
export class ChatPlugin extends BasePlugin {
  /**
   * plugin 名称。
   */
  readonly name = "chat";

  /**
   * 当前实例持有的渠道状态。
   */
  public readonly channelState: ChatChannelState = createChatChannelState();

  /**
   * 当前实例持有的 chat queue worker。
   *
   * 关键点（中文）
   * - worker 生命周期与 chat plugin 保持一致。
   * - 这样 agent 只负责装配，不直接持有 chat 领域长期状态。
   */
  public queueWorker: ChatQueueWorker | null = null;

  /**
   * 当前实例持有的 chat queue store。
   *
   * 关键点（中文）
   * - 这是 chat queue 状态的实例归属起点。
   * - 迁移完成后，入队路径也会统一走这里，而不是模块级全局 queue。
   */
  public readonly queueStore = new ChatQueueStore();

  /**
   * 当前实例持有的显式 plugin 配置。
   */
  public readonly options: ChatPluginOptions;

  /**
   * 当前 plugin 的 system 文本构建器。
   */
  readonly system = async (context: AgentContext): Promise<string> => {
    return await buildChatPluginSystem(context);
  };

  /**
   * 当前 plugin 的 action 定义表。
   */
  readonly actions: PluginActions;

  /**
   * 启动当前实例的 queue worker。
   */
  private startQueueWorker(context: AgentContext): void {
    if (this.queueWorker) return;
    const worker = new ChatQueueWorker({
      logger: context.logger,
      context,
      queueStore: this.queueStore,
      config: this.getQueueWorkerConfig(context),
    });
    worker.start();
    this.queueWorker = worker;
  }

  /**
   * 停止当前实例的 queue worker。
   */
  private stopQueueWorker(): void {
    const worker = this.queueWorker;
    this.queueWorker = null;
    if (!worker) return;
    worker.stop();
  }

  constructor(optionsOrAgent?: ChatPluginOptions | AgentRuntime | null) {
    super(isAgentRuntimeInput(optionsOrAgent) ? optionsOrAgent : null);
    this.options = isAgentRuntimeInput(optionsOrAgent)
      ? {}
      : (optionsOrAgent || {});
    this.actions = createChatPluginActions({
      channelState: this.channelState,
    });
    this.lifecycle = {
      start: async (context) => {
        this.startQueueWorker(context);
        await startChatChannels(this.channelState, context);
      },
      stop: async () => {
        this.stopQueueWorker();
        await stopChatChannels(this.channelState);
      },
    };
  }

  /**
   * 读取 queue worker 配置。
   */
  getQueueWorkerConfig(
    context: AgentContext,
  ): Partial<ChatQueueWorkerConfig> | undefined {
    return this.options.queue || context.config.plugins?.chat?.queue;
  }

  /**
   * 判断指定渠道是否启用。
   */
  isChannelEnabled(context: AgentContext, channel: ChatChannelName): boolean {
    const explicit = this.getExplicitChannelOptions(channel);
    if (explicit) {
      return explicit.enabled !== false;
    }
    return context.config.plugins?.chat?.channels?.[channel]?.enabled === true;
  }

  /**
   * 读取指定渠道的显式账户 ID。
   */
  getChannelAccountId(
    context: AgentContext,
    channel: ChatChannelName,
  ): string {
    const explicit = this.getExplicitChannelOptions(channel);
    const explicitAccountId = String(explicit?.channelAccountId || "").trim();
    if (explicitAccountId) return explicitAccountId;
    const config = context.config.plugins?.chat?.channels?.[channel] as
      | { channelAccountId?: unknown }
      | undefined;
    return String(config?.channelAccountId || "").trim();
  }

  /**
   * 解析指定渠道当前应使用的账户。
   */
  resolveChannelAccount(
    context: AgentContext,
    channel: ChatChannelName,
  ): StoredChannelAccount | null {
    const explicit = this.buildExplicitChannelAccount(channel);
    if (explicit) return explicit;
    const channelAccountId = this.getChannelAccountId(context, channel);
    if (!channelAccountId) return null;
    return getStoredChannelAccountSync(channelAccountId);
  }

  private getExplicitChannelOptions(
    channel: ChatChannelName,
  ): ChatPluginTelegramOptions | ChatPluginFeishuOptions | ChatPluginQqOptions | undefined {
    if (channel === "telegram") return this.options.telegram;
    if (channel === "feishu") return this.options.feishu;
    return this.options.qq;
  }

  private buildExplicitChannelAccount(
    channel: ChatChannelName,
  ): StoredChannelAccount | null {
    const now = new Date().toISOString();

    if (channel === "telegram") {
      const config = this.options.telegram;
      const botToken = String(config?.botToken || "").trim();
      if (!botToken) return null;
      return {
        id: String(config?.channelAccountId || `chat-sdk-${channel}`).trim(),
        channel,
        name: String(config?.name || "telegram").trim() || "telegram",
        botToken,
        createdAt: now,
        updatedAt: now,
      };
    }

    if (channel === "feishu") {
      const config = this.options.feishu;
      const appId = String(config?.appId || "").trim();
      const appSecret = String(config?.appSecret || "").trim();
      if (!appId || !appSecret) return null;
      return {
        id: String(config?.channelAccountId || `chat-sdk-${channel}`).trim(),
        channel,
        name: String(config?.name || "feishu").trim() || "feishu",
        appId,
        appSecret,
        ...(String(config?.domain || "").trim()
          ? { domain: String(config?.domain || "").trim() }
          : {}),
        createdAt: now,
        updatedAt: now,
      };
    }

    const config = this.options.qq;
    const appId = String(config?.appId || "").trim();
    const appSecret = String(config?.appSecret || "").trim();
    if (!appId || !appSecret) return null;
    return {
      id: String(config?.channelAccountId || `chat-sdk-${channel}`).trim(),
      channel,
      name: String(config?.name || "qq").trim() || "qq",
      appId,
      appSecret,
      ...(config?.sandbox === true ? { sandbox: true } : {}),
      createdAt: now,
      updatedAt: now,
    };
  }
}

function isAgentRuntimeInput(
  input: ChatPluginOptions | AgentRuntime | null | undefined,
): input is AgentRuntime | null {
  if (input === null) return true;
  if (!input || typeof input !== "object") return false;
  return typeof (input as AgentRuntime).getSession === "function";
}
