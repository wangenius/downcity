/**
 * ChatService：chat service 的类实现。
 *
 * 关键点（中文）
 * - chat 的渠道 bot 状态归属于 ChatService 实例。
 * - chat 的 queue worker 也归属于 ChatService 实例，而不是 agent 入口。
 * - Index 只保留静态导出入口，这里承接真正的 service class 实现。
 * - action 注册表已经拆到独立模块，当前文件只保留实例骨架。
 */

import type { AgentRuntime } from "@/agent/AgentRuntimeTypes.js";
import { BaseService } from "@/service/builtins/BaseService.js";
import type { ServiceActions } from "@/shared/types/Service.js";
import type { AgentContext } from "@/agent/AgentContextTypes.js";
import type { ChatChannelState } from "@/shared/types/ChatRuntime.js";
import type { StoredChannelAccount } from "@/shared/types/Store.js";
import type { ChatQueueWorkerConfig } from "@/shared/types/ChatQueueWorker.js";
import type {
  ChatServiceFeishuOptions,
  ChatServiceOptions,
  ChatServiceQqOptions,
  ChatServiceTelegramOptions,
} from "@/service/builtins/chat/ChatServiceTypes.js";
import type { ChatChannelName } from "@/service/builtins/chat/types/ChannelStatus.js";
import {
  createChatChannelState,
  startChatChannels,
  stopChatChannels,
} from "./runtime/ChatChannelFacade.js";
import { createChatServiceActions } from "./runtime/ChatServiceActions.js";
import { ChatQueueWorker } from "./runtime/ChatQueueWorker.js";
import { buildChatServiceSystem } from "./runtime/ChatServiceSystem.js";
import { ChatQueueStore } from "./runtime/ChatQueueStore.js";

/**
 * Chat service 类实现。
 */
export class ChatService extends BaseService {
  /**
   * service 名称。
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
   * - worker 生命周期与 chat service 保持一致。
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
   * 当前实例持有的显式 service 配置。
   */
  public readonly options: ChatServiceOptions;

  /**
   * 当前 service 的 system 文本构建器。
   */
  readonly system = async (context: AgentContext): Promise<string> => {
    return await buildChatServiceSystem(context);
  };

  /**
   * 当前 service 的 action 定义表。
   */
  readonly actions: ServiceActions;

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

  constructor(optionsOrAgent?: ChatServiceOptions | AgentRuntime | null) {
    super(isAgentRuntimeInput(optionsOrAgent) ? optionsOrAgent : null);
    this.options = isAgentRuntimeInput(optionsOrAgent)
      ? {}
      : (optionsOrAgent || {});
    this.actions = createChatServiceActions({
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
    return this.options.queue || context.config.services?.chat?.queue;
  }

  /**
   * 判断指定渠道是否启用。
   */
  isChannelEnabled(context: AgentContext, channel: ChatChannelName): boolean {
    const explicit = this.getExplicitChannelOptions(channel);
    if (explicit) {
      return explicit.enabled !== false;
    }
    return context.config.services?.chat?.channels?.[channel]?.enabled === true;
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
    const config = context.config.services?.chat?.channels?.[channel] as
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

    const provider = this.options.channelAccounts;
    if (provider) {
      return provider.getChannelAccount({
        channel,
        context,
        channelAccountId: this.getChannelAccountId(context, channel) || undefined,
      });
    }
    return null;
  }

  private getExplicitChannelOptions(
    channel: ChatChannelName,
  ): ChatServiceTelegramOptions | ChatServiceFeishuOptions | ChatServiceQqOptions | undefined {
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
  input: ChatServiceOptions | AgentRuntime | null | undefined,
): input is AgentRuntime | null {
  if (input === null) return true;
  if (!input || typeof input !== "object") return false;
  return typeof (input as AgentRuntime).getSession === "function";
}
