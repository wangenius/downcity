import { registerChatSender } from "@services/chat/runtime/ChatSendRegistry.js";
import type {
  ChatDispatchAction,
  ChatDispatchChannel,
  ChatDispatchSendActionParams,
  ChatDispatcher,
} from "@services/chat/types/ChatDispatcher.js";
import type { Logger } from "@utils/logger/Logger.js";
import type { ExecutionRuntime } from "@/types/ExecutionRuntime.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { enqueueChatQueue } from "@services/chat/runtime/ChatQueue.js";
import { buildQueuedUserMessageWithInfo } from "@services/chat/runtime/QueuedUserMessage.js";
import {
  resolveSessionIdByChatTarget,
  resolveOrCreateSessionIdByChatTarget,
  upsertChatMetaBySessionId,
} from "@services/chat/runtime/ChatMetaStore.js";
import { deleteChatSessionById } from "@services/chat/runtime/ChatSessionDelete.js";
import {
  appendInboundChatHistory,
  appendOutboundChatHistory,
} from "@services/chat/runtime/ChatHistoryStore.js";
import { appendExecIngress } from "@services/chat/runtime/ChatIngressStore.js";
import {
  guardIncomingChat,
  observeIncomingChatPrincipal,
  resolveIncomingChatUserRole,
} from "@services/chat/runtime/PluginRuntime.js";
import {
  emitChatEnqueueEffect,
  prepareChatEnqueue,
} from "@services/chat/runtime/EnqueueDispatch.js";

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
 * - chatId 是平台原始会话标识（非 sessionId）
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
 *
 * 关键点（中文）
 * - 通过 context 显式注入 runtime 依赖
 * - 统一注册 dispatcher，暴露 sendText/sendAction 能力
 * - 统一封装入站消息落 history/meta + 入队逻辑
 */
export abstract class BaseChatChannel {
  readonly channel: ChatDispatchChannel;
  protected readonly context: ExecutionRuntime;
  protected readonly rootPath: string;
  protected readonly logger: Logger;

  protected constructor(params: {
    channel: ChatDispatchChannel;
    context: ExecutionRuntime;
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
    await observeIncomingChatPrincipal({
      runtime: this.context,
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
        runtime: this.context,
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
    return "当前会话权限不足，已拒绝处理。请在 Console UI 的 Agent / Authorization 页面调整角色后再重试。";
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
   * 通过渠道目标解析或创建 sessionId。
   *
   * 关键点（中文）
   * - sessionId 由映射存储维护，不能通过字符串规则推导。
   */
  private async resolveOrCreateSessionIdByTarget(params: {
    chatId: string;
    chatType?: string;
    messageThreadId?: number;
  }): Promise<string | null> {
    const chatId = String(params.chatId || "").trim();
    if (!chatId) return null;
    return await resolveOrCreateSessionIdByChatTarget({
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
   * - 通过渠道目标映射解析 sessionId，保证与 inbound/history 查询对齐。
   * - 仅做审计落盘，不影响发送结果语义。
   */
  private async appendToolOutboundHistory(
    params: ChannelSendTextParams,
  ): Promise<void> {
    const chatId = String(params.chatId || "").trim();
    const text = String(params.text ?? "");
    if (!chatId || !text.trim()) return;

    const sessionId = await this.resolveOrCreateSessionIdByTarget({
      chatId,
      chatType: params.chatType,
      messageThreadId: params.messageThreadId,
    });
    if (!sessionId) return;

    try {
      await appendOutboundChatHistory({
        context: this.context,
        sessionId,
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
        sessionId,
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
   * 清理某个 sessionId 对应的 agent 会话状态。
   *
   * 说明（中文）
   * - 只清理 runtime/context 层状态，不直接删历史文件
   * - 常用于用户触发“重置对话”类命令
   */
  clearChat(sessionId: string): void {
    const key = String(sessionId || "").trim();
    if (!key) return;
    enqueueChatQueue({
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
    const sessionId = await resolveSessionIdByChatTarget({
      context: this.context,
      channel: this.channel,
      chatId,
      ...(typeof params.chatType === "string" ? { targetType: params.chatType } : {}),
      ...(typeof params.messageThreadId === "number"
        ? { threadId: params.messageThreadId }
        : {}),
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
   * 维护 sessionId 对应的 chat 路由元信息。
   *
   * 关键点（中文）
   * - 由 chat 服务在入站阶段维护，不依赖 core message metadata
   * - 仅做 best-effort，不阻塞主链路
   */
  private async updateChatMeta(params: {
    sessionId: string;
    chatId: string;
    targetType?: string;
    threadId?: number;
    messageId?: string;
    actorId?: string;
    actorName?: string;
    chatTitle?: string;
  }): Promise<void> {
    await upsertChatMetaBySessionId({
      context: this.context,
      sessionId: params.sessionId,
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
   * - 跟 session message history 分离，写入 `.downcity/chat/<sessionId>/history.jsonl`。
   * - 写入失败不阻塞主链路，但会记录 warning。
   */
  private async appendInboundHistory(params: {
    sessionId: string;
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
        sessionId: params.sessionId,
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
        sessionId: params.sessionId,
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
   * - channel/targetId/sessionId 三元组由 channel 层统一补齐
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
    const resolved = await this.resolveOrCreateSessionIdByTarget({
      chatId: params.chatId,
      chatType,
      messageThreadId,
    });
    const sessionId = String(resolved || "").trim();
    if (!sessionId) return;
    const extra = stripUndefinedMeta(meta);
    await this.appendInboundHistory({
      sessionId,
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
      sessionId,
      chatId: params.chatId,
      targetType: chatType,
      threadId: messageThreadId,
      messageId: params.messageId,
      actorId: params.userId,
      actorName: username,
      chatTitle,
    });
    const preparedAudit = await prepareChatEnqueue({
      runtime: this.context,
      input: {
        kind: "audit",
        channel: this.channel,
        chatKey: sessionId,
        chatId: params.chatId,
        text: params.text,
        ...(chatType ? { chatType } : {}),
        ...(typeof messageThreadId === "number" ? { threadId: messageThreadId } : {}),
        ...(typeof params.messageId === "string" ? { messageId: params.messageId } : {}),
        ...(typeof params.userId === "string" ? { actorId: params.userId } : {}),
        ...(typeof username === "string" ? { actorName: username } : {}),
        extra,
      },
    });
    const auditEnqueued = enqueueChatQueue({
      kind: "audit",
      channel: this.channel,
      targetId: params.chatId,
      sessionId,
      ...(typeof preparedAudit.actorId === "string"
        ? { actorId: preparedAudit.actorId }
        : {}),
      ...(typeof preparedAudit.actorName === "string"
        ? { actorName: preparedAudit.actorName }
        : {}),
      ...(typeof preparedAudit.messageId === "string"
        ? { messageId: preparedAudit.messageId }
        : {}),
      text: preparedAudit.text,
      ...(typeof preparedAudit.threadId === "number"
        ? { threadId: preparedAudit.threadId }
        : {}),
      ...(typeof preparedAudit.chatType === "string"
        ? { targetType: preparedAudit.chatType }
        : {}),
      extra:
        preparedAudit.extra && typeof preparedAudit.extra === "object"
            ? (preparedAudit.extra as JsonObject)
            : extra,
    });
    await emitChatEnqueueEffect({
      runtime: this.context,
      input: {
        ...preparedAudit,
        itemId: auditEnqueued.itemId,
        lanePosition: auditEnqueued.lanePosition,
      },
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
    const userRole = await resolveIncomingChatUserRole({
      runtime: this.context,
      channel: this.channel,
      userId: msg.userId,
    });
    const inboundExtra =
      msg.extra && typeof msg.extra === "object" ? stripUndefinedMeta(msg.extra) : {};
    const mergedExtra: JsonObject = {
      ...inboundExtra,
      roleId: userRole?.roleId || "unknown",
      permissions: userRole?.permissions || [],
    };

    const chatKey = await this.resolveOrCreateSessionIdByTarget({
      chatId: msg.chatId,
      chatType: msg.chatType,
      messageThreadId: msg.messageThreadId,
    });
    if (!chatKey) {
      throw new Error("Failed to resolve sessionId for incoming chat message");
    }

    const rawQueuedText = buildQueuedUserMessageWithInfo({
      messageId: msg.messageId,
      userId: msg.userId,
      username: msg.username,
      roleId: userRole?.roleId,
      permissions: userRole?.permissions,
      userTimezone: msg.userTimezone,
      text: msg.text,
    });
    const preparedExec = await prepareChatEnqueue({
      runtime: this.context,
      input: {
        kind: "exec",
        channel: this.channel,
        chatKey,
        chatId: msg.chatId,
        text: rawQueuedText,
        ...(msg.chatType ? { chatType: msg.chatType } : {}),
        ...(typeof msg.messageThreadId === "number"
          ? { threadId: msg.messageThreadId }
          : {}),
        ...(typeof msg.messageId === "string" ? { messageId: msg.messageId } : {}),
        ...(typeof msg.userId === "string" ? { actorId: msg.userId } : {}),
        ...(typeof msg.username === "string" ? { actorName: msg.username } : {}),
        extra: mergedExtra,
      },
    });
    const queuedText = preparedExec.text;
    const queuedExtra =
      preparedExec.extra && typeof preparedExec.extra === "object"
        ? (preparedExec.extra as JsonObject)
        : mergedExtra;

    await appendExecIngress({
      context: this.context,
      sessionId: chatKey,
      channel: this.channel,
      chatId: msg.chatId,
      text: queuedText,
      ...(typeof preparedExec.chatType === "string"
        ? { targetType: preparedExec.chatType }
        : {}),
      ...(typeof preparedExec.threadId === "number"
        ? { threadId: preparedExec.threadId }
        : {}),
      ...(typeof preparedExec.messageId === "string"
        ? { messageId: preparedExec.messageId }
        : {}),
      ...(typeof preparedExec.actorId === "string"
        ? { actorId: preparedExec.actorId }
        : {}),
      ...(typeof preparedExec.actorName === "string"
        ? { actorName: preparedExec.actorName }
        : {}),
      extra: queuedExtra,
    });

    await this.updateChatMeta({
      sessionId: chatKey,
      chatId: msg.chatId,
      targetType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      actorId: msg.userId,
      actorName: msg.username,
      chatTitle: msg.chatTitle,
    });

    const execEnqueued = enqueueChatQueue({
      kind: "exec",
      channel: this.channel,
      targetId: msg.chatId,
      sessionId: chatKey,
      text: queuedText,
      ...(typeof preparedExec.chatType === "string"
        ? { targetType: preparedExec.chatType }
        : {}),
      ...(typeof preparedExec.threadId === "number"
        ? { threadId: preparedExec.threadId }
        : {}),
      ...(typeof preparedExec.messageId === "string"
        ? { messageId: preparedExec.messageId }
        : {}),
      ...(typeof preparedExec.actorId === "string"
        ? { actorId: preparedExec.actorId }
        : {}),
      ...(typeof preparedExec.actorName === "string"
        ? { actorName: preparedExec.actorName }
        : {}),
      sessionPersisted: true,
      extra: queuedExtra,
    });
    await emitChatEnqueueEffect({
      runtime: this.context,
      input: {
        ...preparedExec,
        itemId: execEnqueued.itemId,
        lanePosition: execEnqueued.lanePosition,
      },
    });

    return { chatKey, position: execEnqueued.lanePosition };
  }
}
