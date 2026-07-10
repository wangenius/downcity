/**
 * ChatActionInput：chat plugin runtime 的 CLI 输入映射模块。
 *
 * 关键点（中文）
 * - 这里统一处理命令行到 action payload 的转换。
 * - 所有校验错误都尽量在输入层 fail-fast，避免进入执行层后才发现参数非法。
 * - `chat send` 的 frontmatter / <file> 协议也在这里完成标准化解析。
 */

import type { JsonObject, JsonValue } from "@downcity/agent";
import type { PluginActionCommandInput } from "@downcity/agent";
import type {
  ChatConfigureActionPayload,
  ChatDeleteActionPayload,
  ChatHistoryActionPayload,
  ChatInfoActionPayload,
  ChatListActionPayload,
  ChatReactActionPayload,
} from "@/chat/types/ChatPluginActionPayload.js";
import { resolveChatKey } from "@/chat/Action.js";
import { resolveChatChannelNameOrThrow } from "@/chat/runtime/ChatChannelFacade.js";
import {
  getBooleanOpt,
  getStringOpt,
  isJsonObject,
  parseOptionalTimestampOrThrow,
  parsePositiveIntOptionOrThrow,
  readHistoryDirectionOrThrow,
} from "./ChatActionInputSupport.js";
export {
  mapChatSendCommandInput,
} from "./ChatSendActionInput.js";

export function mapChatChannelCommandInput(
  input: PluginActionCommandInput,
): { channel?: ReturnType<typeof resolveChatChannelNameOrThrow> } {
  const channelRaw = getStringOpt(input.opts, "channel");
  if (!channelRaw) return {};
  return {
    channel: resolveChatChannelNameOrThrow(channelRaw),
  };
}

export function mapChatListCommandInput(
  input: PluginActionCommandInput,
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

export function mapChatInfoCommandInput(
  input: PluginActionCommandInput,
): ChatInfoActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapChatConfigureCommandInput(
  input: PluginActionCommandInput,
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

export function mapChatHistoryCommandInput(
  input: PluginActionCommandInput,
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

export function mapChatReactCommandInput(
  input: PluginActionCommandInput,
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

export function mapChatDeleteCommandInput(
  input: PluginActionCommandInput,
): ChatDeleteActionPayload {
  const chatKey = getStringOpt(input.opts, "chatKey");
  const sessionId = getStringOpt(input.opts, "sessionId");
  return {
    ...(chatKey ? { chatKey } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}
