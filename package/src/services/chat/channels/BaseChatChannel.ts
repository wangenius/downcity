import { registerChatSender } from "@services/chat/runtime/ChatSendRegistry.js";
import type {
  ChatDispatchAction,
  ChatDispatchChannel,
  ChatDispatchSendActionParams,
  ChatDispatcher,
} from "@services/chat/types/ChatDispatcher.js";
import type { Logger } from "@utils/logger/Logger.js";
import type { ServiceRuntime } from "@/agent/service/ServiceRuntime.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { enqueueChatQueue } from "@services/chat/runtime/ChatQueue.js";
import { buildQueuedUserMessageWithInfo } from "@services/chat/runtime/QueuedUserMessage.js";
import {
  resolveContextIdByChatTarget,
  resolveOrCreateContextIdByChatTarget,
  upsertChatMetaByContextId,
} from "@services/chat/runtime/ChatMetaStore.js";
import { deleteChatContextById } from "@services/chat/runtime/ChatContextDelete.js";
import {
  appendInboundChatHistory,
  appendOutboundChatHistory,
} from "@services/chat/runtime/ChatHistoryStore.js";
import type { ChatMasterStatus } from "@services/chat/types/ChatAuth.js";
import { resolveTelegramMasterStatus } from "@services/chat/channels/telegram/Auth.js";
import { resolveFeishuMasterStatus } from "@services/chat/channels/feishu/Auth.js";
import { resolveQqMasterStatus } from "@services/chat/channels/qq/Auth.js";
import {
  evaluateIncomingChatAuthorization,
  resolveOwnerMatch,
} from "@services/chat/runtime/AuthorizationPolicy.js";
import { readChatAuthorizationConfigSync } from "@services/chat/runtime/AuthorizationConfig.js";
import {
  recordObservedAuthorizationPrincipal,
  upsertAuthorizationPairingRequest,
} from "@services/chat/runtime/AuthorizationStore.js";

type ChannelUserMessageMeta = {
  [key: string]: JsonValue | undefined;
};

function stripUndefinedMeta(meta: ChannelUserMessageMeta): JsonObject {
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Channel chatKey 计算入参。
 *
 * 说明（中文）
 * - chatId 必填；其余字段用于区分 topic/thread/消息上下文
 * - 不同平台可按需消费这些字段
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
 * - chatId 是平台原始会话标识（非 contextId）
 * - messageThreadId 用于支持 topic/thread 细粒度并发
 * - 该结构只描述“接收侧”，不包含平台发送参数
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
   * 会话展示名（群名/频道名/私聊对象名）。
   *
   * 说明（中文）
   * - 由各平台适配器 best-effort 提供。
   * - 用于 Context 列表展示，不参与路由。
   */
  chatTitle?: string;
  /**
   * 可选：由上游显式覆盖主人身份判定（通常无需传，默认由 auth 模块计算）。
   */
  isMaster?: boolean;
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
  decision: "allow" | "block" | "pairing";
  reason: string;
  isOwner: boolean;
};

/**
 * Chat channel 基类。
 *
 * 关键点（中文）
 * - 通过 context 显式注入 runtime 依赖
 * - 统一注册 dispatcher，暴露 sendText/sendAction 能力
 * - 统一封装入站消息落 history/meta + 入队逻辑
 */
export abstract class BaseChatChannel {
  readonly channel: ChatDispatchChannel;
  protected readonly context: ServiceRuntime;
  protected readonly rootPath: string;
  protected readonly logger: Logger;

  protected constructor(params: {
    channel: ChatDispatchChannel;
    context: ServiceRuntime;
  }) {
    this.channel = params.channel;
    this.context = params.context;
    this.rootPath = params.context.rootPath;
    this.logger = params.context.logger;

    // 统一把“平台发送能力”注册到 chat-send registry。
    // 后续 `chat_send` 等工具只依赖 channel，不耦合具体 channel 实例。
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
    await recordObservedAuthorizationPrincipal({
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
  protected evaluateIncomingAuthorization(
    params: IncomingAuthorizationParams,
  ): IncomingAuthorizationResult {
    const authorizationConfig = readChatAuthorizationConfigSync(this.context.rootPath);
    const result = evaluateIncomingChatAuthorization({
      config: this.context.config,
      channel: this.channel,
      authorizationConfig,
      input: {
        channel: this.channel,
        chatId: params.chatId,
        chatType: params.chatType,
        userId: params.userId,
        username: params.username,
        chatTitle: params.chatTitle,
      },
    });
    return result;
  }

  /**
   * 创建 / 更新 pairing 请求。
   */
  protected async createPairingRequest(
    params: IncomingAuthorizationParams,
  ): Promise<void> {
    const userId = String(params.userId || "").trim();
    if (!userId) return;
    await upsertAuthorizationPairingRequest({
      context: this.context,
      channel: this.channel,
      userId,
      username: params.username,
      chatId: params.chatId,
      chatTitle: params.chatTitle,
      chatType: params.chatType,
    });
  }

  /**
   * 生成 pairing 提示文案。
   */
  protected buildPairingRequiredText(params: { userId?: string }): string {
    const idLabel =
      this.channel === "telegram"
        ? "Telegram user id"
        : this.channel === "feishu"
          ? "Feishu user id"
          : "QQ user id";
    const userId = String(params.userId || "").trim() || "unknown";
    return [
      "当前会话尚未获得授权，已创建待审批请求。",
      `你的 ${idLabel}: ${userId}`,
      "请在 Console UI 的 Agent / Authorization 页面审批后再重试。",
    ].join("\n");
  }

  /**
   * 生成未授权提示文案。
   */
  protected buildUnauthorizedBlockedText(): string {
    return "当前会话未被授权，已拒绝处理。请在 Console UI 的 Agent / Authorization 页面配置后再重试。";
  }

  /**
   * 是否在 `sendToolText` 成功后自动写入 outbound chat history。
   *
   * 关键点（中文）
   * - 默认开启，覆盖 QQ/Feishu 等未自行写 outbound history 的渠道。
   * - 已有独立 outbound 落盘逻辑的渠道（如 Telegram）应覆写为 false，避免重复记录。
   */
  protected shouldAppendOutboundHistoryOnSend(): boolean {
    return true;
  }

  /**
   * 通过渠道目标解析或创建 contextId。
   *
   * 关键点（中文）
   * - contextId 由映射存储维护，不能通过字符串规则推导。
   */
  private async resolveOrCreateContextIdByTarget(params: {
    chatId: string;
    chatType?: string;
    messageThreadId?: number;
  }): Promise<string | null> {
    const chatId = String(params.chatId || "").trim();
    if (!chatId) return null;
    return await resolveOrCreateContextIdByChatTarget({
      context: this.context,
      channel: this.channel,
      chatId,
      ...(typeof params.chatType === "string" ? { targetType: params.chatType } : {}),
      ...(typeof params.messageThreadId === "number"
        ? { threadId: params.messageThreadId }
        : {}),
    });
  }

  /**
   * 在工具侧文本发送成功后补齐 outbound history。
   *
   * 关键点（中文）
   * - 通过渠道目标映射解析 contextId，保证与 inbound/history 查询对齐。
   * - 仅做审计落盘，不影响发送结果语义。
   */
  private async appendToolOutboundHistory(
    params: ChannelSendTextParams,
  ): Promise<void> {
    const chatId = String(params.chatId || "").trim();
    const text = String(params.text ?? "");
    if (!chatId || !text.trim()) return;

    const contextId = await this.resolveOrCreateContextIdByTarget({
      chatId,
      chatType: params.chatType,
      messageThreadId: params.messageThreadId,
    });
    if (!contextId) return;

    try {
      await appendOutboundChatHistory({
        context: this.context,
        contextId,
        channel: this.channel,
        chatId,
        text,
        targetType: params.chatType,
        ...(typeof params.messageThreadId === "number"
          ? { threadId: params.messageThreadId }
          : {}),
        ...(typeof params.messageId === "string" && params.messageId
          ? { messageId: params.messageId }
          : {}),
        extra: {
          source: "channel_send_tool_text",
        },
      });
    } catch (error) {
      this.logger.warn("Failed to append outbound chat history", {
        error: String(error),
        channel: this.channel,
        contextId,
        chatId,
      });
    }
  }

  /**
   * 供工具层调用的文本发送统一入口。
   *
   * 设计点（中文）
   * - 空 chatId 视为参数错误
   * - 空文本视为幂等 no-op（返回 success）
   * - 平台异常收敛为 `{ success: false, error }`，避免抛出破坏工具协议
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
        await this.appendToolOutboundHistory(normalized);
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
   * - action 可选，缺失时按 no-op 处理
   * - 若平台未实现 sendActionToPlatform，返回明确 not supported
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
   * 清理某个 contextId 对应的 agent 会话状态。
   *
   * 说明（中文）
   * - 只清理 runtime/context 层状态，不直接删历史文件
   * - 常用于用户触发“重置对话”类命令
   */
  clearChat(contextId: string): void {
    const key = String(contextId || "").trim();
    if (!key) return;
    enqueueChatQueue({
      kind: "control",
      channel: this.channel,
      targetId: key,
      contextId: key,
      text: "",
      control: { type: "clear" },
    });
    this.logger.info(`Cleared chat: ${key}`);
  }

  /**
   * 按渠道目标清理会话（映射到内部 contextId）。
   */
  protected async clearChatByTarget(params: ChannelChatKeyParams): Promise<void> {
    const chatId = String(params.chatId || "").trim();
    if (!chatId) return;
    const contextId = await resolveContextIdByChatTarget({
      context: this.context,
      channel: this.channel,
      chatId,
      ...(typeof params.chatType === "string" ? { targetType: params.chatType } : {}),
      ...(typeof params.messageThreadId === "number"
        ? { threadId: params.messageThreadId }
        : {}),
    });
    if (!contextId) {
      this.logger.info("Skip clear chat: context mapping not found", {
        channel: this.channel,
        chatId,
        chatType: params.chatType,
        messageThreadId: params.messageThreadId,
      });
      return;
    }
    const deleted = await deleteChatContextById({
      context: this.context,
      contextId,
    });
    if (!deleted.success) {
      this.logger.warn("Failed to delete chat context by target", {
        channel: this.channel,
        chatId,
        contextId,
        error: deleted.error || "delete failed",
      });
      return;
    }
    this.logger.info("Deleted chat context by target", {
      channel: this.channel,
      chatId,
      contextId,
      removedMeta: deleted.removedMeta,
      removedChatDir: deleted.removedChatDir,
      removedContextDir: deleted.removedContextDir,
    });
  }

  /**
   * 维护 contextId 对应的 chat 路由元信息。
   *
   * 关键点（中文）
   * - 由 chat 服务在入站阶段维护，不依赖 core message metadata
   * - 仅做 best-effort，不阻塞主链路
   */
  private async updateChatMeta(params: {
    contextId: string;
    chatId: string;
    targetType?: string;
    threadId?: number;
    messageId?: string;
    actorId?: string;
    actorName?: string;
    chatTitle?: string;
  }): Promise<void> {
    await upsertChatMetaByContextId({
      context: this.context,
      contextId: params.contextId,
      channel: this.channel,
      chatId: params.chatId,
      targetType: params.targetType,
      threadId: params.threadId,
      messageId: params.messageId,
      actorId: params.actorId,
      actorName: params.actorName,
      chatTitle: params.chatTitle,
    });
  }

  /**
   * 记录入站 chat 事件（审计流）。
   *
   * 关键点（中文）
   * - 跟 context message history 分离，写入 `.ship/chat/<contextId>/history.jsonl`。
   * - 写入失败不阻塞主链路，但会记录 warning。
   */
  private async appendInboundHistory(params: {
    contextId: string;
    chatId: string;
    ingressKind: "audit" | "exec";
    text: string;
    targetType?: string;
    threadId?: number;
    messageId?: string;
    actorId?: string;
    actorName?: string;
    extra?: JsonObject;
  }): Promise<void> {
    try {
      await appendInboundChatHistory({
        context: this.context,
        contextId: params.contextId,
        channel: this.channel,
        chatId: params.chatId,
        ingressKind: params.ingressKind,
        text: params.text,
        targetType: params.targetType,
        threadId: params.threadId,
        messageId: params.messageId,
        actorId: params.actorId,
        actorName: params.actorName,
        extra: params.extra,
      });
    } catch (error) {
      this.logger.warn("Failed to append inbound chat history", {
        error: String(error),
        channel: this.channel,
        contextId: params.contextId,
        chatId: params.chatId,
        ingressKind: params.ingressKind,
      });
    }
  }

  /**
   * 入站消息写入队列（审计用途，不触发执行）。
   *
   * 说明（中文）
   * - 先落 `chat history`（审计流），再入队
   * - channel/targetId/contextId 三元组由 channel 层统一补齐
   */
  protected async enqueueAuditMessage(params: {
    chatId: string;
    messageId?: string;
    userId?: string;
    text: string;
    meta?: ChannelUserMessageMeta;
  }): Promise<void> {
    const meta = (params.meta || {}) as ChannelUserMessageMeta;
    const username = typeof meta.username === "string" ? meta.username : undefined;
    const messageThreadId =
      typeof meta.messageThreadId === "number" && Number.isFinite(meta.messageThreadId)
        ? meta.messageThreadId
        : undefined;
    const chatType = typeof meta.chatType === "string" ? meta.chatType : undefined;
    const chatTitle =
      typeof meta.chatTitle === "string" ? meta.chatTitle.trim() || undefined : undefined;
    const resolved = await this.resolveOrCreateContextIdByTarget({
      chatId: params.chatId,
      chatType,
      messageThreadId,
    });
    const contextId = String(resolved || "").trim();
    if (!contextId) return;
    const extra = stripUndefinedMeta(meta);
    await this.appendInboundHistory({
      contextId,
      chatId: params.chatId,
      ingressKind: "audit",
      text: params.text,
      targetType: chatType,
      threadId: messageThreadId,
      messageId: params.messageId,
      actorId: params.userId,
      actorName: username,
      extra,
    });
    await this.updateChatMeta({
      contextId,
      chatId: params.chatId,
      targetType: chatType,
      threadId: messageThreadId,
      messageId: params.messageId,
      actorId: params.userId,
      actorName: username,
      chatTitle,
    });
    enqueueChatQueue({
      kind: "audit",
      channel: this.channel,
      targetId: params.chatId,
      contextId,
      actorId: params.userId,
      actorName: username,
      messageId: params.messageId,
      text: params.text,
      threadId: messageThreadId,
      targetType: chatType,
      extra,
    });
  }

  /**
   * 将消息送入会话调度器队列。
   *
   * 返回值语义（中文）
   * - chatKey: lane 归属键（同 key 串行）
   * - position: 当前 lane 中排队位置（便于日志与观测）
   */
  protected async enqueueMessage(
    msg: IncomingChatMessage,
  ): Promise<{ chatKey: string; position: number }> {
    const explicitMasterStatus: ChatMasterStatus | undefined =
      typeof msg.isMaster === "boolean"
        ? msg.isMaster
          ? "master"
          : "guest"
        : undefined;
    const masterStatus =
      explicitMasterStatus ||
      this.resolveMasterStatusByChannel({ userId: msg.userId });
    const masterExtra: JsonObject = {
      masterStatus,
      ...(masterStatus === "master" ? { isMaster: true } : {}),
      ...(masterStatus === "guest" ? { isMaster: false } : {}),
    };

    const chatKey = await this.resolveOrCreateContextIdByTarget({
      chatId: msg.chatId,
      chatType: msg.chatType,
      messageThreadId: msg.messageThreadId,
    });
    if (!chatKey) {
      throw new Error("Failed to resolve contextId for incoming chat message");
    }

    const queuedText = buildQueuedUserMessageWithInfo({
      channel: this.channel,
      contextId: chatKey,
      chatKey,
      chatId: msg.chatId,
      chatType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      userId: msg.userId,
      username: msg.username,
      masterStatus,
      text: msg.text,
    });

    await this.appendInboundHistory({
      contextId: chatKey,
      chatId: msg.chatId,
      ingressKind: "exec",
      text: queuedText,
      targetType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      actorId: msg.userId,
      actorName: msg.username,
      extra: masterExtra,
    });

    await this.updateChatMeta({
      contextId: chatKey,
      chatId: msg.chatId,
      targetType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      actorId: msg.userId,
      actorName: msg.username,
      chatTitle: msg.chatTitle,
    });

    const { lanePosition } = enqueueChatQueue({
      kind: "exec",
      channel: this.channel,
      targetId: msg.chatId,
      contextId: chatKey,
      text: queuedText,
      targetType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      actorId: msg.userId,
      actorName: msg.username,
      extra: masterExtra,
    });

    return { chatKey, position: lanePosition };
  }

  /**
   * 按 channel 分发主人鉴权逻辑。
   *
   * 关键点（中文）
   * - 鉴权实现放在各自 channel 的 `Auth.ts` 中。
   * - Base 仅负责统一分发，避免集中式“全平台鉴权模块”。
   */
  private resolveMasterStatusByChannel(params: {
    userId?: string;
  }): ChatMasterStatus {
    if (this.channel === "telegram") {
      return resolveTelegramMasterStatus({
        config: this.context.config,
        env: this.context.env,
        rootPath: this.context.rootPath,
        userId: params.userId,
      });
    }
    if (this.channel === "feishu") {
      return resolveFeishuMasterStatus({
        config: this.context.config,
        env: this.context.env,
        rootPath: this.context.rootPath,
        userId: params.userId,
      });
    }
    if (this.channel === "qq") {
      return resolveQqMasterStatus({
        config: this.context.config,
        env: this.context.env,
        rootPath: this.context.rootPath,
        userId: params.userId,
      });
    }
    return resolveOwnerMatch({
      config: this.context.config,
      channel: this.channel,
      env: this.context.env,
      userId: params.userId,
      authorizationConfig: readChatAuthorizationConfigSync(this.context.rootPath),
    });
  }
}
