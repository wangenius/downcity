/**
 * ChatActionInput：chat service 的 CLI/API 输入映射模块。
 *
 * 关键点（中文）
 * - 这里统一处理命令行与 HTTP 请求到 action payload 的转换。
 * - 所有校验错误都尽量在输入层 fail-fast，避免进入执行层后才发现参数非法。
 * - `chat send` 的 frontmatter / <file> 协议也在这里完成标准化解析。
 */

import type { JsonObject, JsonValue } from "@/types/common/Json.js";
import type { ServiceActionCommandInput } from "@/service/types/Service.js";
import type {
  ChatConfigureActionPayload,
  ChatDeleteActionPayload,
  ChatHistoryActionPayload,
  ChatInfoActionPayload,
  ChatListActionPayload,
  ChatReactActionPayload,
} from "@/service/builtins/chat/types/ChatService.js";
import { resolveChatKey } from "@/service/builtins/chat/Action.js";
import { resolveChatChannelNameOrThrow } from "@/service/builtins/chat/runtime/ChatChannelFacade.js";
import {
  getBooleanOpt,
  getStringOpt,
  isJsonObject,
  parseOptionalTimestampOrThrow,
  parsePositiveIntOptionOrThrow,
  readHistoryDirectionOrThrow,
} from "./ChatActionInputSupport.js";
export {
  mapChatSendApiInput,
  mapChatSendCommandInput,
} from "./ChatSendActionInput.js";

export function mapChatChannelCommandInput(
  input: ServiceActionCommandInput,
): { channel?: ReturnType<typeof resolveChatChannelNameOrThrow> } {
  const channelRaw = getStringOpt(input.opts, "channel");
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

export function mapChatChannelApiInput(
  body: JsonValue,
): { channel?: ReturnType<typeof resolveChatChannelNameOrThrow> } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const channelRaw =
    typeof (body as JsonObject).channel === "string"
      ? String((body as JsonObject).channel).trim()
      : "";
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

export function mapChatChannelApiQueryInput(query?: {
  channel?: string;
}): { channel?: ReturnType<typeof resolveChatChannelNameOrThrow> } {
  const channelRaw = String(query?.channel || "").trim();
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

export function mapChatListCommandInput(
  input: ServiceActionCommandInput,
): ChatListActionPayload {
  const channelRaw = getStringOpt(input.opts, "channel");
  const limitRaw = getStringOpt(input.opts, "limit");
  const q = getStringOpt(input.opts, "q");
  const channel = channelRaw ? resolveChatChannelNameOrThrow(channelRaw) : undefined;
  const limit = limitRaw ? parsePositiveIntOptionOrThrow(limitRaw, "limit") : undefined;
  return {
    ...(channel ? { channel } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(q ? { q } : {}),
  };
}

export function mapChatListApiInput(query?: {
  channel?: string;
  limit?: string;
  q?: string;
}): ChatListActionPayload {
  const channelRaw = String(query?.channel || "").trim();
  const limitRaw = String(query?.limit || "").trim();
  const q = String(query?.q || "").trim();
  const channel = channelRaw ? resolveChatChannelNameOrThrow(channelRaw) : undefined;
  const limit = limitRaw ? parsePositiveIntOptionOrThrow(limitRaw, "limit") : undefined;
  return {
    ...(channel ? { channel } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(q ? { q } : {}),
  };
}

export function mapChatInfoCommandInput(
  input: ServiceActionCommandInput,
): ChatInfoActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapChatInfoApiInput(query?: {
  chatKey?: string;
  sessionId?: string;
}): ChatInfoActionPayload {
  const chatKey = String(query?.chatKey || "").trim();
  const sessionId = String(query?.sessionId || "").trim();
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapChatConfigureCommandInput(
  input: ServiceActionCommandInput,
): ChatConfigureActionPayload {
  const channelRaw = getStringOpt(input.opts, "channel");
  if (!channelRaw) {
    throw new Error("Missing --channel. Use telegram|feishu|qq.");
  }
  const channel = resolveChatChannelNameOrThrow(channelRaw);
  const rawConfigJson = getStringOpt(input.opts, "configJson");
  if (!rawConfigJson) {
    throw new Error("Missing --config-json.");
  }
  let parsed: JsonValue = {};
  try {
    parsed = JSON.parse(rawConfigJson) as JsonValue;
  } catch (error) {
    throw new Error(`Invalid --config-json: ${String(error)}`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error("--config-json must be a JSON object");
  }
  return {
    channel,
    config: parsed as Record<string, JsonValue>,
    restart: getBooleanOpt(input.opts, "restart"),
  };
}

export async function mapChatConfigureApiInput(c: {
  req: {
    json: () => Promise<JsonValue>;
  };
}): Promise<ChatConfigureActionPayload> {
  const body = await c.req.json().catch(() => ({} as JsonValue));
  if (!isJsonObject(body)) {
    throw new Error("Invalid JSON body");
  }
  const channelRaw = typeof body.channel === "string" ? String(body.channel).trim() : "";
  if (!channelRaw) {
    throw new Error("Missing channel");
  }
  const configRaw = body.config;
  if (!isJsonObject(configRaw)) {
    throw new Error("Missing config object");
  }
  const restart = typeof body.restart === "boolean" ? body.restart : undefined;
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
    config: configRaw as Record<string, JsonValue>,
    ...(typeof restart === "boolean" ? { restart } : {}),
  };
}

export function mapChatHistoryCommandInput(
  input: ServiceActionCommandInput,
): ChatHistoryActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
  const direction = readHistoryDirectionOrThrow(
    getStringOpt(input.opts, "direction"),
  );
  const limitRaw = getStringOpt(input.opts, "limit");
  const beforeTs = parseOptionalTimestampOrThrow(
    getStringOpt(input.opts, "beforeTs"),
    "beforeTs",
  );
  const afterTs = parseOptionalTimestampOrThrow(
    getStringOpt(input.opts, "afterTs"),
    "afterTs",
  );
  const limit = limitRaw ? parsePositiveIntOptionOrThrow(limitRaw, "limit") : undefined;

  if (
    typeof beforeTs === "number" &&
    typeof afterTs === "number" &&
    afterTs >= beforeTs
  ) {
    throw new Error("Invalid range: afterTs must be less than beforeTs.");
  }

  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

export function mapChatHistoryApiInput(query: {
  chatKey?: string;
  sessionId?: string;
  limit?: string;
  direction?: string;
  beforeTs?: string;
  afterTs?: string;
}): ChatHistoryActionPayload {
  const direction = readHistoryDirectionOrThrow(String(query.direction || ""));
  const limitText = String(query.limit || "").trim();
  const limit = limitText
    ? parsePositiveIntOptionOrThrow(limitText, "limit")
    : undefined;
  const beforeTs = parseOptionalTimestampOrThrow(
    String(query.beforeTs || ""),
    "beforeTs",
  );
  const afterTs = parseOptionalTimestampOrThrow(
    String(query.afterTs || ""),
    "afterTs",
  );
  if (
    typeof beforeTs === "number" &&
    typeof afterTs === "number" &&
    afterTs >= beforeTs
  ) {
    throw new Error("Invalid range: afterTs must be less than beforeTs.");
  }

  const chatKey = String(query.chatKey || "").trim();
  const sessionId = String(query.sessionId || "").trim();
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
    ...(typeof limit === "number" ? { limit } : {}),
    ...(direction ? { direction } : {}),
    ...(typeof beforeTs === "number" ? { beforeTs } : {}),
    ...(typeof afterTs === "number" ? { afterTs } : {}),
  };
}

export function mapChatReactCommandInput(
  input: ServiceActionCommandInput,
): ChatReactActionPayload {
  const chatKey = resolveChatKey({
    chatKey: getStringOpt(input.opts, "chatKey"),
  });
  if (!chatKey) {
    throw new Error(
      "Missing chatKey. Provide --chat-key or ensure DC_CTX_CHAT_KEY is injected in current shell context.",
    );
  }

  const emoji = getStringOpt(input.opts, "emoji");
  const messageId = getStringOpt(input.opts, "messageId");
  const big = getBooleanOpt(input.opts, "big");
  return {
    chatKey,
    ...(emoji ? { emoji } : {}),
    ...(messageId ? { messageId } : {}),
    ...(big ? { big: true } : {}),
  };
}

export function mapChatReactApiInput(body: JsonValue): ChatReactActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const payload = body as JsonObject;
  const chatKey =
    typeof payload.chatKey === "string" ? payload.chatKey.trim() : undefined;
  const emoji = typeof payload.emoji === "string" ? payload.emoji.trim() : undefined;
  const messageId =
    typeof payload.messageId === "string" || typeof payload.messageId === "number"
      ? String(payload.messageId).trim()
      : undefined;
  const big = payload.big === true;
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(emoji ? { emoji } : {}),
    ...(messageId ? { messageId } : {}),
    ...(big ? { big: true } : {}),
  };
}

export function mapChatDeleteCommandInput(
  input: ServiceActionCommandInput,
): ChatDeleteActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapChatDeleteApiInput(body: JsonValue): ChatDeleteActionPayload {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {};
  }
  const payload = body as JsonObject;
  const chatKey = typeof payload.chatKey === "string" ? payload.chatKey.trim() : "";
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId.trim() : "";
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}
