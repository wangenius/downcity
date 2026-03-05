/**
 * Chat 命令协议类型。
 *
 * 关键点（中文）
 * - chat 模块自有请求/响应类型放在 chat/types
 * - 避免所有业务类型集中堆到全局 types/
 */

export type ChatContextSnapshot = {
  contextId?: string;
  chatKey?: string;
  channel?: string;
  chatId?: string;
  messageThreadId?: number;
  chatType?: string;
  userId?: string;
  messageId?: string;
  requestId?: string;
};

export type ChatSendRequest = {
  text: string;
  chatKey?: string;
  delayMs?: number;
  sendAtMs?: number;
  replyToMessage?: boolean;
};

export type ChatSendResponse = {
  success: boolean;
  chatKey?: string;
  error?: string;
};

export type ChatReactRequest = {
  chatKey?: string;
  messageId?: string;
  emoji?: string;
  big?: boolean;
};

export type ChatReactResponse = {
  success: boolean;
  chatKey?: string;
  messageId?: string;
  error?: string;
};

export type ChatHistoryDirection = "all" | "inbound" | "outbound";

export type ChatHistoryRequest = {
  chatKey?: string;
  contextId?: string;
  limit?: number;
  direction?: ChatHistoryDirection;
  beforeTs?: number;
  afterTs?: number;
};
