/**
 * ChatService：chat service 的类实现。
 *
 * 关键点（中文）
 * - chat 的渠道 bot 运行态归属于 ChatService 实例。
 * - chat 的 queue worker 也归属于 ChatService 实例，而不是 agent 入口。
 * - Index 只保留静态导出入口，这里承接真正的 service class 实现。
 * - action 注册表已经拆到独立模块，当前文件只保留实例骨架。
 */

import type { AgentRuntime } from "@agent/RuntimeState.js";
import { BaseService } from "@services/BaseService.js";
import type { ServiceActions, Service } from "@/types/Service.js";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type { ChatChannelState } from "@/types/ChatRuntime.js";
import {
  createChatChannelState,
  startChatChannels,
  stopChatChannels,
} from "./runtime/ChatChannelRuntime.js";
import { createChatServiceActions } from "./runtime/ChatServiceActions.js";
import { ChatQueueWorker } from "./runtime/ChatQueueWorker.js";
import { buildChatServiceSystem } from "./runtime/ChatServiceSystem.js";

/**
 * Chat service 类实现。
 */
export class ChatService extends BaseService {
  /**
   * service 名称。
   */
  readonly name = "chat";

  /**
   * 当前实例持有的渠道运行态。
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
   * 当前 service 的 system 文本构建器。
   */
  readonly system = async (context: ExecutionRuntime): Promise<string> => {
    return await buildChatServiceSystem(context);
  };

  /**
   * 当前 service 的 action 定义表。
   */
  readonly actions: ServiceActions;

  /**
   * 启动当前实例的 queue worker。
   */
  private startQueueWorker(context: ExecutionRuntime): void {
    if (this.queueWorker) return;
    const worker = new ChatQueueWorker({
      logger: context.logger,
      context,
      config: context.config.services?.chat?.queue,
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

  constructor(agent: AgentRuntime | null) {
    super(agent);
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
}

export const chatService: Service = new ChatService(null);
