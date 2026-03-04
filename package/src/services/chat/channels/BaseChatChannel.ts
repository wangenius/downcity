import { registerChatSender } from "@services/chat/runtime/ChatSendRegistry.js";
import type {
  ChatDispatchAction,
  ChatDispatchChannel,
  ChatDispatchSendActionParams,
  ChatDispatcher,
} from "@services/chat/types/ChatDispatcher.js";
import type { Logger } from "@utils/logger/Logger.js";
import type { ServiceRuntime } from "@/main/service/ServiceRuntime.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";
import { enqueueChatQueue } from "@services/chat/runtime/ChatQueue.js";
import { upsertChatMetaByContextId } from "@services/chat/runtime/ChatMetaStore.js";
import { appendInboundChatHistory } from "@services/chat/runtime/ChatHistoryStore.js";

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
};

export type ChannelSendActionParams = ChannelChatKeyParams & {
  action: ChatDispatchAction;
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
      await this.sendTextToPlatform({ ...params, chatId, text });
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
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  /**
   * 清理某个 chatKey 对应的 agent 会话状态。
   *
   * 说明（中文）
   * - 只清理 runtime/context 层状态，不直接删历史文件
   * - 常用于用户触发“重置对话”类命令
   */
  clearChat(chatKey: string): void {
    enqueueChatQueue({
      kind: "control",
      channel: this.channel,
      targetId: chatKey,
      contextId: chatKey,
      text: "",
      control: { type: "clear" },
    });
    this.logger.info(`Cleared chat: ${chatKey}`);
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
    chatKey: string;
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
    const extra = stripUndefinedMeta(meta);
    await this.appendInboundHistory({
      contextId: params.chatKey,
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
      contextId: params.chatKey,
      chatId: params.chatId,
      targetType: chatType,
      threadId: messageThreadId,
      messageId: params.messageId,
      actorId: params.userId,
      actorName: username,
    });
    enqueueChatQueue({
      kind: "audit",
      channel: this.channel,
      targetId: params.chatId,
      contextId: params.chatKey,
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
    const chatKey = this.getChatKey({
      chatId: msg.chatId,
      chatType: msg.chatType,
      messageThreadId: msg.messageThreadId,
      messageId: msg.messageId,
    });

    await this.appendInboundHistory({
      contextId: chatKey,
      chatId: msg.chatId,
      ingressKind: "exec",
      text: msg.text,
      targetType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      actorId: msg.userId,
      actorName: msg.username,
    });

    await this.updateChatMeta({
      contextId: chatKey,
      chatId: msg.chatId,
      targetType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      actorId: msg.userId,
      actorName: msg.username,
    });

    const { lanePosition } = enqueueChatQueue({
      kind: "exec",
      channel: this.channel,
      targetId: msg.chatId,
      contextId: chatKey,
      text: msg.text,
      targetType: msg.chatType,
      threadId: msg.messageThreadId,
      messageId: msg.messageId,
      actorId: msg.userId,
      actorName: msg.username,
    });

    return { chatKey, position: lanePosition };
  }
}
