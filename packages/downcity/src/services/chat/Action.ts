/**
 * Chat command services.
 *
 * 关键点（中文）
 * - chat 语义（chatKey 与 contextId 映射）统一收口在本模块
 * - 通过 RequestContext（ALS）读取当前请求上下文
 */

import type { ServiceRuntime } from "@/console/service/ServiceRuntime.js";
import { requestContext } from "@agent/context/manager/RequestContext.js";
import {
  sendActionByChatKey,
  sendTextByChatKey,
} from "./runtime/ChatkeySend.js";
import { deleteChatContextById } from "./runtime/ChatContextDelete.js";
import type { ChatDispatchAction } from "./types/ChatDispatcher.js";
import type {
  ChatContextSnapshot,
  ChatDeleteResponse,
  ChatReactResponse,
  ChatSendResponse,
} from "./types/ChatCommand.js";

/**
 * 读取字符串环境变量。
 *
 * 关键点（中文）
 * - 自动 trim；空字符串视为未设置。
 */
function readEnvString(name: string): string | undefined {
  const value = String(process.env[name] || "").trim();
  return value ? value : undefined;
}

/**
 * 读取数字环境变量。
 *
 * 关键点（中文）
 * - 解析失败返回 undefined，不抛错。
 */
function readEnvNumber(name: string): number | undefined {
  const raw = readEnvString(name);
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return undefined;
  return parsed;
}

/**
 * 解析 chat 上下文快照。
 *
 * 优先级（中文）
 * 1) 显式参数
 * 2) RequestContext（ALS）
 * 3) 环境变量回退
 */
export function resolveChatContextSnapshot(input?: {
  contextId?: string;
  chatKey?: string;
  context?: ServiceRuntime;
}): ChatContextSnapshot {
  const requestCtx = requestContext.getStore();

  const explicitContextId = String(input?.contextId || "").trim();
  const explicitChatKey = String(input?.chatKey || "").trim();
  const requestContextId =
    typeof requestCtx?.contextId === "string" && requestCtx.contextId.trim()
      ? requestCtx.contextId.trim()
      : undefined;
  const envContextId = readEnvString("DC_CTX_CONTEXT_ID");
  const envChatKey = readEnvString("DC_CTX_CHAT_KEY");
  const channel = readEnvString("DC_CTX_CHANNEL") || undefined;
  const chatId =
    readEnvString("DC_CTX_TARGET_ID") || readEnvString("DC_CTX_CHAT_ID");
  const messageThreadId =
    readEnvNumber("DC_CTX_THREAD_ID") ||
    readEnvNumber("DC_CTX_MESSAGE_THREAD_ID");
  const chatType =
    readEnvString("DC_CTX_TARGET_TYPE") ||
    readEnvString("DC_CTX_CHAT_TYPE");
  const userId =
    readEnvString("DC_CTX_ACTOR_ID") ||
    readEnvString("DC_CTX_USER_ID");
  const messageId = readEnvString("DC_CTX_MESSAGE_ID");
  const requestId =
    (typeof requestCtx?.requestId === "string" && requestCtx.requestId.trim()
      ? requestCtx.requestId.trim()
      : readEnvString("DC_CTX_REQUEST_ID")) || undefined;

  const contextId =
    explicitContextId ||
    requestContextId ||
    envContextId ||
    explicitChatKey ||
    envChatKey;
  const chatKey =
    explicitChatKey ||
    mapContextIdToChatKey(contextId) ||
    envChatKey;

  const snapshot: ChatContextSnapshot = {
    ...(contextId ? { contextId } : {}),
    ...(chatKey ? { chatKey } : {}),
    channel,
    chatId,
    messageThreadId,
    chatType,
    userId,
    messageId,
    requestId,
  };

  return snapshot;
}

/**
 * 将 contextId 映射为可发送的 chatKey。
 *
 * 关键点（中文）
 * - 当前实现下：chat service 内部把 contextId 视作可发送 chatKey。
 * - 不再依赖字符串规则推导（contextId 可为随机值）。
 */
export function mapContextIdToChatKey(contextId?: string): string | undefined {
  const key = String(contextId || "").trim();
  if (!key) return undefined;
  return key;
}

/**
 * 提取最终 contextId。
 */
export function resolveContextId(input?: {
  contextId?: string;
  chatKey?: string;
  context?: ServiceRuntime;
}): string | undefined {
  const snapshot = resolveChatContextSnapshot({
    contextId: input?.contextId,
    chatKey: input?.chatKey,
    context: input?.context,
  });
  const key = String(snapshot.contextId || "").trim();
  return key ? key : undefined;
}

/**
 * 提取最终 chatKey（用于发送路径）。
 */
export function resolveChatKey(input?: {
  chatKey?: string;
  contextId?: string;
  context?: ServiceRuntime;
}): string | undefined {
  const snapshot = resolveChatContextSnapshot({
    chatKey: input?.chatKey,
    contextId: input?.contextId,
    context: input?.context,
  });
  const key = String(snapshot.chatKey || "").trim();
  return key ? key : undefined;
}

/**
 * 解析当前发送应绑定的 reply messageId。
 *
 * 关键点（中文）
 * - 只有显式 reply 且未手动传入 messageId 时才尝试补全。
 * - 仅在目标 chatKey 与当前请求上下文一致时，才复用 `DC_CTX_MESSAGE_ID` / ALS 快照。
 * - 这样可把一次 run 固定到触发它的那条消息，避免处理中被后续新消息覆盖。
 */
function resolveReplyMessageIdForChatSend(params: {
  chatKey: string;
  context: ServiceRuntime;
  replyToMessage: boolean;
  explicitMessageId?: string;
}): string | undefined {
  const explicitMessageId =
    typeof params.explicitMessageId === "string" && params.explicitMessageId.trim()
      ? params.explicitMessageId.trim()
      : undefined;
  if (explicitMessageId) return explicitMessageId;
  if (params.replyToMessage !== true) return undefined;

  const snapshot = resolveChatContextSnapshot({
    context: params.context,
  });
  const snapshotChatKey = String(snapshot.chatKey || "").trim();
  const snapshotMessageId = String(snapshot.messageId || "").trim();
  if (!snapshotChatKey || !snapshotMessageId) return undefined;
  return snapshotChatKey === params.chatKey ? snapshotMessageId : undefined;
}

/**
 * 规范化 `chat send` 文本。
 *
 * 关键点（中文）
 * - 当文本只包含字面量转义（如 `\n`）且没有真实换行时，自动解码为真实控制字符。
 * - 这样可兼容模型/脚本把多行文本写成 `\\n` 的场景，避免用户看到原样 `\n`。
 */
export function normalizeChatSendText(raw: string): string {
  const text = String(raw ?? "");
  if (!text) return text;

  const hasRealLineBreak = text.includes("\n") || text.includes("\r");
  let normalized = text;

  if (
    !hasRealLineBreak &&
    (text.includes("\\n") || text.includes("\\r") || text.includes("\\t"))
  ) {
    normalized = text
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }

  return normalized;
}

/**
 * 发送前延迟。
 *
 * 关键点（中文）
 * - 支持延迟毫秒（delayMs）或绝对时间（sendAtMs）
 * - 超长等待按分片 setTimeout，避免超出 Node 单次定时器上限
 */
function resolveTargetWaitMs(params: {
  delayMs: number;
  sendAtMs?: number;
}): number {
  const delayMs = params.delayMs;
  const sendAtMs = params.sendAtMs;
  const rawWaitMs =
    typeof sendAtMs === "number" ? Math.max(0, sendAtMs - Date.now()) : delayMs;
  if (!Number.isFinite(rawWaitMs) || Number.isNaN(rawWaitMs) || rawWaitMs <= 0) return 0;
  return Math.trunc(rawWaitMs);
}

async function waitByTimeoutChunks(waitMs: number): Promise<void> {
  if (!Number.isFinite(waitMs) || Number.isNaN(waitMs) || waitMs <= 0) return;
  const MAX_TIMEOUT_MS = 2_147_483_647;
  let remaining = Math.trunc(waitMs);
  while (remaining > 0) {
    const chunk = Math.min(remaining, MAX_TIMEOUT_MS);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, chunk);
    });
    remaining -= chunk;
  }
}

async function waitBeforeSend(params: {
  delayMs: number;
  sendAtMs?: number;
}): Promise<void> {
  await waitByTimeoutChunks(resolveTargetWaitMs(params));
}

/**
 * 按 chatKey 发送文本。
 *
 * 关键点（中文）
 * - service 不关心具体平台；由 runtime sender 做 channel 分发。
 * - 返回统一结构，便于上层链路做可观测与错误汇总。
 */
export async function sendChatTextByChatKey(params: {
  context: ServiceRuntime;
  chatKey: string;
  text: string;
  delayMs?: number;
  sendAtMs?: number;
  /**
   * 延迟发送是否异步调度（不阻塞当前调用）。
   *
   * 关键点（中文）
   * - 仅在存在有效 delay/sendAt 时生效。
   * - 默认 false，保持 CLI/API 的阻塞行为不变。
   */
  nonBlockingDelay?: boolean;
  replyToMessage?: boolean;
  messageId?: string;
}): Promise<ChatSendResponse> {
  const chatKey = String(params.chatKey || "").trim();
  const text = normalizeChatSendText(String(params.text ?? ""));
  const delayMs =
    typeof params.delayMs === "number" && Number.isFinite(params.delayMs)
      ? Math.max(0, Math.trunc(params.delayMs))
      : 0;
  const sendAtMs =
    typeof params.sendAtMs === "number" && Number.isFinite(params.sendAtMs)
      ? Math.max(0, Math.trunc(params.sendAtMs))
      : undefined;
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }
  if (delayMs > 0 && typeof sendAtMs === "number") {
    return {
      success: false,
      chatKey,
      error: "delayMs and sendAtMs cannot be used together",
    };
  }

  const replyToMessage = params.replyToMessage === true;
  const messageId = resolveReplyMessageIdForChatSend({
    context: params.context,
    chatKey,
    replyToMessage,
    explicitMessageId: params.messageId,
  });
  const targetWaitMs = resolveTargetWaitMs({ delayMs, sendAtMs });
  if (params.nonBlockingDelay === true && targetWaitMs > 0) {
    // 关键点（中文）：异步调度延迟发送，让调用方可立即结束当前 run。
    void (async () => {
      try {
        await waitByTimeoutChunks(targetWaitMs);
        const delayed = await sendTextByChatKey({
          context: params.context,
          chatKey,
          text,
          replyToMessage,
          ...(messageId ? { messageId } : {}),
        });
        if (!delayed.success) {
          params.context.logger.warn("Delayed chat send failed", {
            chatKey,
            error: delayed.error || "chat send failed",
          });
        }
      } catch (error) {
        params.context.logger.warn("Delayed chat send failed", {
          chatKey,
          error: String(error),
        });
      }
    })();
    return {
      success: true,
      chatKey,
    };
  }

  await waitBeforeSend({ delayMs, sendAtMs });

  const result = await sendTextByChatKey({
    context: params.context,
    chatKey,
    text,
    replyToMessage,
    ...(messageId ? { messageId } : {}),
  });
  return {
    success: Boolean(result.success),
    chatKey,
    ...(result.success ? {} : { error: result.error || "chat send failed" }),
  };
}

/**
 * 按 chatKey 发送平台动作（typing/react）。
 *
 * 关键点（中文）
 * - 动作分发与文本发送复用同一 chatKey 解析与 channel dispatcher。
 */
export async function sendChatActionByChatKey(params: {
  context: ServiceRuntime;
  chatKey: string;
  action: ChatDispatchAction;
  messageId?: string;
  reactionEmoji?: string;
  reactionIsBig?: boolean;
}): Promise<ChatReactResponse> {
  const chatKey = String(params.chatKey || "").trim();
  if (!chatKey) {
    return {
      success: false,
      error: "Missing chatKey",
    };
  }

  const result = await sendActionByChatKey({
    context: params.context,
    chatKey,
    action: params.action,
    messageId: params.messageId,
    reactionEmoji: params.reactionEmoji,
    reactionIsBig: params.reactionIsBig,
  });
  const messageId = String(params.messageId || "").trim();
  return {
    success: Boolean(result.success),
    chatKey,
    ...(messageId ? { messageId } : {}),
    ...(result.success ? {} : { error: result.error || "chat action failed" }),
  };
}

/**
 * 按 contextId 发送文本。
 *
 * 关键点（中文）
 * - contextId -> chatKey 映射关系只在 chat service 内部维护。
 */
export async function sendChatTextByContextId(params: {
  context: ServiceRuntime;
  contextId: string;
  text: string;
  delayMs?: number;
  sendAtMs?: number;
  replyToMessage?: boolean;
  messageId?: string;
}): Promise<{ success: boolean; contextId: string; error?: string }> {
  const contextId = String(params.contextId || "").trim();
  if (!contextId) {
    return {
      success: false,
      contextId: "",
      error: "Missing contextId",
    };
  }

  const result = await sendChatTextByChatKey({
    context: params.context,
    chatKey: contextId,
    text: params.text,
    delayMs: params.delayMs,
    sendAtMs: params.sendAtMs,
    replyToMessage: params.replyToMessage === true,
    ...(typeof params.messageId === "string" && params.messageId.trim()
      ? { messageId: params.messageId.trim() }
      : {}),
  });
  return {
    success: Boolean(result.success),
    contextId,
    ...(result.success ? {} : { error: result.error || "chat send failed" }),
  };
}

/**
 * 按 chatKey/contextId 彻底删除 chat 会话。
 *
 * 关键点（中文）
 * - chatKey 与 contextId 在 chat service 内部等价使用。
 * - 删除包含：路由映射 + chat 审计目录 + context 目录 + 运行态清理。
 */
export async function deleteChatByChatKey(params: {
  context: ServiceRuntime;
  chatKey?: string;
  contextId?: string;
}): Promise<ChatDeleteResponse> {
  const chatKey = resolveChatKey({
    context: params.context,
    chatKey: params.chatKey,
    contextId: params.contextId,
  });
  const contextId = String(chatKey || "").trim();
  if (!contextId) {
    return {
      success: false,
      error:
        "Missing chatKey/contextId. Provide --chat-key or --context-id, or ensure DC_CTX_CHAT_KEY/DC_CTX_CONTEXT_ID is injected.",
    };
  }

  const result = await deleteChatContextById({
    context: params.context,
    sessionId: contextId,
  });
  return {
    success: result.success,
    contextId: result.sessionId,
    deleted: result.deleted,
    removedMeta: result.removedMeta,
    removedChatDir: result.removedChatDir,
    removedContextDir: result.removedContextDir,
    ...(result.success ? {} : { error: result.error || "chat delete failed" }),
  };
}
