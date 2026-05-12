/**
 * Chat channel 基类。
 *
 * 关键点（中文）
 * - 通过 context 显式注入 runtime 依赖。
 * - 统一注册 dispatcher，暴露 sendText/sendAction 能力。
 * - 基类只保留授权、工具发送与入站编排；存储/队列细节已下沉到辅助模块。
 */

import { registerChatSender } from "@services/chat/runtime/ChatSendRegistry.js";
import type {
  ChatDispatchAction,
  ChatDispatchChannel,
  ChatDispatchSendActionParams,
  ChatDispatcher,
} from "@services/chat/types/ChatDispatcher.js";
import type { Logger } from "@shared/utils/logger/Logger.js";
import type { AgentContext } from "@/types/agent/AgentContext.js";
import { resolveChatQueueStore } from "@services/chat/runtime/ChatQueue.js";
import { deleteChatSessionById } from "@services/chat/runtime/ChatSessionDelete.js";
import {
  guardIncomingChat,
  observeIncomingChatPrincipal,
} from "@services/chat/runtime/PluginDispatch.js";
import {
  appendToolOutboundChannelHistory,
  resolveChannelSessionId,
  type ChannelUserMessageMeta,
} from "./BaseChatChannelSupport.js";
import {
  enqueueAuditChannelMessage,
  enqueueExecChannelMessage,
} from "./BaseChatChannelQueue.js";

/**
 * Channel chatKey 计算入参。
 *
 * 说明（中文）
 * - chatId 必填；其余字段用于区分 topic/thread/消息上下文。
 * - 不同平台可按需消费这些字段。
 */
export type ChannelChatKeyParams = {
  chatId: string;
  messageThreadId?: number;
  chatType?: string;
  messageId?: string;
};

export type ChannelSendTextParams = ChannelChatKeyParams & {
  text: string;
  replyToMessage?: boolean;
};

export type ChannelSendActionParams = ChannelChatKeyParams & {
  action: ChatDispatchAction;
  reactionEmoji?: string;
  reactionIsBig?: boolean;
};

/**
 * 入站消息统一结构（跨平台最小公共字段）。
 *
 * 说明（中文）
 * - chatId 是平台原始会话标识（非 sessionId）。
 * - messageThreadId 用于支持 topic / thread 细粒度并发。
 * - 该结构只描述“接收侧”，不包含平台发送参数。
 */
export type IncomingChatMessage = {
  chatId: string;
  text: string;
  chatType?: string;
  messageId?: string;
  messageThreadId?: number;
  userId?: string;
  username?: string;
  /**
   * 用户时区。
   *
   * 说明（中文）
   * - 仅在上游显式提供时传入。
   * - 第三方 IM 平台 bot 通常不会直接提供该字段。
   */
  userTimezone?: string;
  /**
   * 会话展示名（群名/频道名/私聊对象名）。
   *
   * 说明（中文）
   * - 由各平台适配器 best-effort 提供。
   * - 用于 Context 列表展示，不参与路由。
   */
  chatTitle?: string;
  /**
   * 入站附加元信息。
   *
   * 说明（中文）
   * - 用于透传 reply 上下文等平台特有信息。
   * - 会进入 history / context metadata，但不改变基础路由语义。
   */
  extra?: ChannelUserMessageMeta;
};

/**
 * 入站授权判定输入。
 */
export type IncomingAuthorizationParams = {
  chatId: string;
  chatType?: string;
  userId?: string;
  username?: string;
  chatTitle?: string;
};

/**
 * 入站授权判定结果。
 */
export type IncomingAuthorizationResult = {
  decision: "allow" | "block";
  reason: string;
};

/**
 * Chat channel 基类。
 */
export abstract class BaseChatChannel {
  readonly channel: ChatDispatchChannel;
  protected readonly context: AgentContext;
  protected readonly rootPath: string;
  protected readonly logger: Logger;

  protected constructor(params: {
    channel: ChatDispatchChannel;
    context: AgentContext;
  }) {
    this.channel = params.channel;
    this.context = params.context;
    this.rootPath = params.context.rootPath;
    this.logger = params.context.logger;

    const dispatcher: ChatDispatcher = {
      sendText: async (p) => this.sendToolText(p),
    };
    if (typeof this.sendActionToPlatform === "function") {
      dispatcher.sendAction = async (p) => this.sendToolAction(p);
    }
    registerChatSender(this.channel, dispatcher);
  }

  protected abstract getChatKey(params: ChannelChatKeyParams): string;

  protected abstract sendTextToPlatform(
    params: ChannelSendTextParams,
  ): Promise<void>;

  protected sendActionToPlatform?(
    params: ChannelSendActionParams,
  ): Promise<void>;

  /**
   * 发送授权提示文本。
   *
   * 关键点（中文）
   * - 一律按普通消息发送，不挂 reply，避免把“权限提示”误挂到某条消息下面。
   */
  protected async sendAuthorizationText(params: {
    chatId: string;
    text: string;
    chatType?: string;
    messageThreadId?: number;
  }): Promise<void> {
    await this.sendTextToPlatform({
      chatId: params.chatId,
      text: params.text,
      ...(typeof params.chatType === "string" ? { chatType: params.chatType } : {}),
      ...(typeof params.messageThreadId === "number"
        ? { messageThreadId: params.messageThreadId }
        : {}),
    });
  }

  /**
   * 记录入站观测主体。
   */
  protected async observeIncomingAuthorization(
    params: IncomingAuthorizationParams,
  ): Promise<void> {
    await observeIncomingChatPrincipal({
      context: this.context,
      channel: this.channel,
      chatId: params.chatId,
      chatType: params.chatType,
      chatTitle: params.chatTitle,
      userId: params.userId,
      username: params.username,
    });
  }

  /**
   * 执行入站授权判定。
   */
  protected async evaluateIncomingAuthorization(
    params: IncomingAuthorizationParams,
  ): Promise<IncomingAuthorizationResult> {
    try {
      await guardIncomingChat({
        context: this.context,
        channel: this.channel,
        input: {
          channel: this.channel,
          chatId: params.chatId,
          chatType: params.chatType,
          userId: params.userId,
          username: params.username,
          chatTitle: params.chatTitle,
        },
      });
      return {
        decision: "allow",
        reason: "allow",
      };
    } catch (error) {
      return {
        decision: "block",
        reason: String(error || "blocked"),
      };
    }
  }

  /**
   * 生成未授权提示文案。
   */
  protected buildUnauthorizedBlockedText(): string {
    return "当前会话权限不足，已拒绝处理。请在 Console 的 Agent / Authorization 页面调整角色后再重试。";
  }

  /**
   * 是否在 `sendToolText` 成功后自动写入 outbound chat history。
   *
   * 关键点（中文）
   * - 默认开启，覆盖 QQ / Feishu 等未自行写 outbound history 的渠道。
   * - 已有独立 outbound 落盘逻辑的渠道（如 Telegram）应覆写为 false，避免重复记录。
   */
  protected shouldAppendOutboundHistoryOnSend(): boolean {
    return true;
  }

  /**
   * 供工具层调用的文本发送统一入口。
   *
   * 设计点（中文）
   * - 空 chatId 视为参数错误。
   * - 空文本视为幂等 no-op（返回 success）。
   * - 平台异常收敛为 `{ success: false, error }`，避免抛出破坏工具协议。
   */
  async sendToolText(
    params: ChannelSendTextParams,
  ): Promise<{ success: boolean; error?: string }> {
    const chatId = String(params.chatId || "").trim();
    const text = String(params.text ?? "");
    if (!chatId) return { success: false, error: "Missing chatId" };
    if (!text.trim()) return { success: true };

    try {
      const normalized: ChannelSendTextParams = { ...params, chatId, text };
      await this.sendTextToPlatform(normalized);
      if (this.shouldAppendOutboundHistoryOnSend()) {
        await appendToolOutboundChannelHistory({
          context: this.context,
          logger: this.logger,
          channel: this.channel,
          chatId: normalized.chatId,
          chatType: normalized.chatType,
          messageThreadId: normalized.messageThreadId,
          text: normalized.text,
          ...(typeof normalized.messageId === "string"
            ? { messageId: normalized.messageId }
            : {}),
        });
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  /**
   * 供工具层调用的动作发送入口（如 typing）。
   *
   * 设计点（中文）
   * - action 可选，缺失时按 no-op 处理。
   * - 若平台未实现 sendActionToPlatform，返回明确 not supported。
   */
  async sendToolAction(
    params: ChatDispatchSendActionParams,
  ): Promise<{ success: boolean; error?: string }> {
    const chatId = String(params.chatId || "").trim();
    if (!chatId) return { success: false, error: "Missing chatId" };

    const action = params.action;
    if (!action) return { success: true };

    const send = this.sendActionToPlatform;
    if (typeof send !== "function") {
      return { success: false, error: "sendAction not supported" };
    }

    try {
      await send.call(this, {
        chatId,
        action,
        messageThreadId: params.messageThreadId,
        chatType: params.chatType,
        messageId: params.messageId,
        reactionEmoji: params.reactionEmoji,
        reactionIsBig: params.reactionIsBig,
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  /**
   * 清理某个 sessionId 对应的 agent 会话状态。
   *
   * 说明（中文）
   * - 只清理 runtime / context 层状态，不直接删历史文件。
   * - 常用于用户触发“重置对话”类命令。
   */
  clearChat(sessionId: string): void {
    const key = String(sessionId || "").trim();
    if (!key) return;
    resolveChatQueueStore(this.context).enqueue({
      kind: "control",
      channel: this.channel,
      targetId: key,
      sessionId: key,
      text: "",
      control: { type: "clear" },
    });
    this.logger.info(`Cleared chat: ${key}`);
  }

  /**
   * 按渠道目标清理会话（映射到内部 sessionId）。
   */
  protected async clearChatByTarget(params: ChannelChatKeyParams): Promise<void> {
    const chatId = String(params.chatId || "").trim();
    if (!chatId) return;
    const sessionId = await resolveChannelSessionId({
      context: this.context,
      channel: this.channel,
      chatId,
      chatType: params.chatType,
      messageThreadId: params.messageThreadId,
    });
    if (!sessionId) {
      this.logger.info("Skip clear chat: context mapping not found", {
        channel: this.channel,
        chatId,
        chatType: params.chatType,
        messageThreadId: params.messageThreadId,
      });
      return;
    }
    const deleted = await deleteChatSessionById({
      context: this.context,
      sessionId,
    });
    if (!deleted.success) {
      this.logger.warn("Failed to delete chat context by target", {
        channel: this.channel,
        chatId,
        sessionId,
        error: deleted.error || "delete failed",
      });
      return;
    }
    this.logger.info("Deleted chat context by target", {
      channel: this.channel,
      chatId,
      sessionId,
      removedMeta: deleted.removedMeta,
      removedChatDir: deleted.removedChatDir,
      removedSessionDir: deleted.removedSessionDir,
    });
  }

  /**
   * 入站消息写入队列（审计用途，不触发执行）。
   */
  protected async enqueueAuditMessage(params: {
    chatId: string;
    messageId?: string;
    userId?: string;
    text: string;
    meta?: ChannelUserMessageMeta;
  }): Promise<void> {
    await enqueueAuditChannelMessage({
      context: this.context,
      channel: this.channel,
      chatId: params.chatId,
      text: params.text,
      ...(typeof params.messageId === "string" ? { messageId: params.messageId } : {}),
      ...(typeof params.userId === "string" ? { userId: params.userId } : {}),
      ...(params.meta ? { meta: params.meta } : {}),
    });
  }

  /**
   * 将消息送入会话调度器队列。
   *
   * 返回值语义（中文）
   * - chatKey: lane 归属键（同 key 串行）。
   * - position: 当前 lane 中排队位置（便于日志与观测）。
   */
  protected async enqueueMessage(
    msg: IncomingChatMessage,
  ): Promise<{ chatKey: string; position: number }> {
    return await enqueueExecChannelMessage({
      context: this.context,
      channel: this.channel,
      message: msg,
    });
  }
}
