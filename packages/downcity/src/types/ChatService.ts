/**
 * ChatService 类型定义。
 *
 * 关键点（中文）
 * - 这里集中声明 chat service action 的输入 payload。
 * - 这些类型属于跨模块共享契约，因此统一放到 `types/` 下。
 * - 字段命名保持与 CLI/API 参数一致，降低映射心智负担。
 */

import type { JsonValue } from "@/types/Json.js";
import type {
  ChatDeleteRequest,
  ChatHistoryRequest,
  ChatInfoRequest,
  ChatListRequest,
  ChatReactRequest,
} from "@services/chat/types/ChatCommand.js";
import type { ChatChannelName } from "@services/chat/types/ChannelStatus.js";

/**
 * `chat.send` action 的输入载荷。
 */
export type ChatSendActionPayload = {
  /**
   * 要发送的正文文本。
   */
  text: string;
  /**
   * 目标 chatKey；未显式传入时可由执行上下文补全。
   */
  chatKey?: string;
  /**
   * 延迟发送毫秒数；与 `sendAtMs` 互斥。
   */
  delayMs?: number;
  /**
   * 绝对发送时间戳（毫秒）；与 `delayMs` 互斥。
   */
  sendAtMs?: number;
  /**
   * 是否使用 reply_to_message 语义回复目标消息。
   */
  replyToMessage?: boolean;
  /**
   * 显式指定目标消息 ID；通常用于 reply/react 等场景。
   */
  messageId?: string;
};

/**
 * 读取会话上下文类 action 的输入载荷。
 */
export type ChatSessionActionPayload = {
  /**
   * 目标 chatKey；与 sessionId 二选一即可。
   */
  chatKey?: string;
  /**
   * 目标 sessionId；优先级高于 chatKey。
   */
  sessionId?: string;
};

/**
 * `chat.history` action 的输入载荷。
 */
export type ChatHistoryActionPayload = ChatHistoryRequest;

/**
 * `chat.react` action 的输入载荷。
 */
export type ChatReactActionPayload = ChatReactRequest;

/**
 * `chat.delete` action 的输入载荷。
 */
export type ChatDeleteActionPayload = ChatDeleteRequest;

/**
 * `chat.list` action 的输入载荷。
 */
export type ChatListActionPayload = ChatListRequest;

/**
 * `chat.info` action 的输入载荷。
 */
export type ChatInfoActionPayload = ChatInfoRequest;

/**
 * `chat.status` action 的输入载荷。
 */
export type ChatStatusActionPayload = {
  /**
   * 指定目标渠道；省略时表示全部渠道。
   */
  channel?: ChatChannelName;
};

/**
 * `chat.test` action 的输入载荷。
 */
export type ChatTestActionPayload = {
  /**
   * 指定目标渠道；省略时表示全部渠道。
   */
  channel?: ChatChannelName;
};

/**
 * `chat.reconnect` action 的输入载荷。
 */
export type ChatReconnectActionPayload = {
  /**
   * 指定目标渠道；省略时表示全部渠道。
   */
  channel?: ChatChannelName;
};

/**
 * `chat.open` action 的输入载荷。
 */
export type ChatOpenActionPayload = {
  /**
   * 指定目标渠道；省略时表示全部渠道。
   */
  channel?: ChatChannelName;
};

/**
 * `chat.close` action 的输入载荷。
 */
export type ChatCloseActionPayload = {
  /**
   * 指定目标渠道；省略时表示全部渠道。
   */
  channel?: ChatChannelName;
};

/**
 * `chat.configuration` action 的输入载荷。
 */
export type ChatConfigurationActionPayload = {
  /**
   * 指定目标渠道；省略时表示全部渠道。
   */
  channel?: ChatChannelName;
};

/**
 * `chat.configure` action 的输入载荷。
 */
export type ChatConfigureActionPayload = {
  /**
   * 要更新的目标渠道。
   */
  channel: ChatChannelName;
  /**
   * 渠道配置 patch；值类型遵循 channel configuration 元信息。
   */
  config: Record<string, JsonValue>;
  /**
   * 配置完成后是否立即重启目标渠道；默认由上层解释为 true。
   */
  restart?: boolean;
};
