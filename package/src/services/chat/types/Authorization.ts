/**
 * Chat 授权模型类型定义。
 *
 * 关键点（中文）
 * - 统一承载 chat 渠道的 owner / allowlist / pairing / group policy。
 * - 配置层（console `ship.db`）与运行时状态层（.ship/chat/authorization/state.json）共用同一套领域模型。
 * - 所有字段都以“用户可管理”为目标设计，便于 Console UI 直接消费。
 */

import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

/**
 * 私聊访问策略。
 *
 * 含义（中文）
 * - `open`：任何私聊用户都可直接触发。
 * - `pairing`：未授权用户会创建待审批请求，审批后进入 allowlist。
 * - `allowlist`：只有 allowFrom 内用户可触发。
 * - `disabled`：完全关闭私聊入口。
 */
export type ChatAuthorizationDmPolicy =
  | "open"
  | "pairing"
  | "allowlist"
  | "disabled";

/**
 * 群聊访问策略。
 *
 * 含义（中文）
 * - `open`：任何群都可触发。
 * - `allowlist`：只有 groupAllowFrom 内的群可触发。
 * - `disabled`：完全关闭群聊 / 频道入口。
 */
export type ChatAuthorizationGroupPolicy =
  | "open"
  | "allowlist"
  | "disabled";

/**
 * 单个群/频道的细粒度授权配置。
 */
export interface ChatAuthorizationGroupConfig {
  /**
   * 该群内允许触发的用户 ID 列表。
   *
   * 说明（中文）
   * - 为空或缺省表示不额外限制发言者。
   * - 命中后才允许该群内的对应用户触发。
   */
  allowFrom?: string[];
}

/**
 * 单个渠道的授权配置。
 */
export interface ChatChannelAuthorizationConfig {
  /**
   * 当前渠道的 owner 用户 ID 列表。
   *
   * 说明（中文）
   * - owner 仅用于 `is_master` / 高权限标识。
   * - owner 通常也是 allowFrom 成员，但两者职责不同。
   */
  ownerIds?: string[];

  /**
   * 私聊访问策略。
   */
  dmPolicy?: ChatAuthorizationDmPolicy;

  /**
   * 私聊允许用户列表。
   *
   * 说明（中文）
   * - 与 `dmPolicy=allowlist|pairing` 配合使用。
   * - pairing 审批通过后通常会把用户加入这里。
   */
  allowFrom?: string[];

  /**
   * 群聊访问策略。
   */
  groupPolicy?: ChatAuthorizationGroupPolicy;

  /**
   * 允许触发的群 / 频道 ID 列表。
   *
   * 说明（中文）
   * - 仅在 `groupPolicy=allowlist` 时生效。
   */
  groupAllowFrom?: string[];

  /**
   * 单个群/频道的附加授权配置。
   *
   * 说明（中文）
   * - key 为平台原始 chatId。
   * - 当前仅支持群内发言者 allowlist。
   */
  groups?: Record<string, ChatAuthorizationGroupConfig>;
}

/**
 * chat 授权总配置。
 *
 * 说明（中文）
 * - 静态配置保存在 console `~/.ship/ship.db` 的 agent 级加密配置中。
 */
export interface ChatAuthorizationConfig {
  /**
   * 各渠道授权配置。
   *
   * 说明（中文）
   * - 未配置的渠道会使用默认策略。
   */
  channels?: Partial<Record<ChatDispatchChannel, ChatChannelAuthorizationConfig>>;
}

/**
 * 入站授权判定输入。
 */
export interface ChatAuthorizationEvaluateInput {
  /**
   * 当前消息来源渠道。
   */
  channel: ChatDispatchChannel;

  /**
   * 当前消息所属会话 ID。
   */
  chatId: string;

  /**
   * 当前消息所属会话类型。
   *
   * 说明（中文）
   * - 用于区分私聊 / 群聊 / 频道。
   */
  chatType?: string;

  /**
   * 当前消息发送者用户 ID。
   */
  userId?: string;

  /**
   * 当前消息发送者展示名。
   */
  username?: string;

  /**
   * 当前会话展示名（群名 / 私聊对象名 / 频道名）。
   */
  chatTitle?: string;
}

/**
 * 授权判定结果。
 */
export type ChatAuthorizationDecision =
  | "allow"
  | "block"
  | "pairing";

/**
 * 运行时授权结果。
 */
export interface ChatAuthorizationEvaluateResult {
  /**
   * 最终判定结果。
   */
  decision: ChatAuthorizationDecision;

  /**
   * 当前用户是否 owner。
   */
  isOwner: boolean;

  /**
   * 结果原因。
   *
   * 说明（中文）
   * - 主要用于日志、UI 调试与审计展示。
   */
  reason: string;
}

/**
 * 观测到的用户主体快照。
 */
export interface ChatAuthorizationObservedUser {
  /**
   * 记录版本号。
   */
  v: 1;

  /**
   * 渠道名。
   */
  channel: ChatDispatchChannel;

  /**
   * 用户 ID。
   */
  userId: string;

  /**
   * 最近一次观测到的用户名 / 展示名。
   */
  username?: string;

  /**
   * 最近一次发言所在会话 ID。
   */
  lastChatId?: string;

  /**
   * 最近一次发言所在会话标题。
   */
  lastChatTitle?: string;

  /**
   * 最近一次发言所在会话类型。
   */
  lastChatType?: string;

  /**
   * 首次观测时间戳（毫秒）。
   */
  firstSeenAt: number;

  /**
   * 最近观测时间戳（毫秒）。
   */
  lastSeenAt: number;
}

/**
 * 观测到的会话主体快照。
 */
export interface ChatAuthorizationObservedChat {
  /**
   * 记录版本号。
   */
  v: 1;

  /**
   * 渠道名。
   */
  channel: ChatDispatchChannel;

  /**
   * 会话 ID。
   */
  chatId: string;

  /**
   * 最近一次观测到的会话标题。
   */
  chatTitle?: string;

  /**
   * 会话类型。
   */
  chatType?: string;

  /**
   * 最近一次发言用户 ID。
   */
  lastActorId?: string;

  /**
   * 最近一次发言用户名 / 展示名。
   */
  lastActorName?: string;

  /**
   * 首次观测时间戳（毫秒）。
   */
  firstSeenAt: number;

  /**
   * 最近观测时间戳（毫秒）。
   */
  lastSeenAt: number;
}

/**
 * pairing 待审批请求。
 */
export interface ChatAuthorizationPairingRequest {
  /**
   * 记录版本号。
   */
  v: 1;

  /**
   * 渠道名。
   */
  channel: ChatDispatchChannel;

  /**
   * 请求用户 ID。
   */
  userId: string;

  /**
   * 请求用户最近一次用户名 / 展示名。
   */
  username?: string;

  /**
   * 最近一次发起请求的会话 ID。
   */
  chatId?: string;

  /**
   * 最近一次发起请求的会话标题。
   */
  chatTitle?: string;

  /**
   * 最近一次发起请求的会话类型。
   */
  chatType?: string;

  /**
   * 首次请求时间戳（毫秒）。
   */
  createdAt: number;

  /**
   * 最近更新时间戳（毫秒）。
   */
  updatedAt: number;
}

/**
 * 授权运行时状态文件。
 */
export interface ChatAuthorizationStateFile {
  /**
   * 状态文件版本号。
   */
  v: 1;

  /**
   * 文件最近更新时间戳（毫秒）。
   */
  updatedAt: number;

  /**
   * 按 `channel:userId` 建索引的用户观测快照。
   */
  usersByKey: Record<string, ChatAuthorizationObservedUser>;

  /**
   * 按 `channel:chatId` 建索引的会话观测快照。
   */
  chatsByKey: Record<string, ChatAuthorizationObservedChat>;

  /**
   * 按 `channel:userId` 建索引的 pending pairing 请求。
   */
  pairingRequestsByKey: Record<string, ChatAuthorizationPairingRequest>;
}

/**
 * Console UI / mainview 使用的授权摘要。
 */
export interface ChatAuthorizationSnapshot {
  /**
   * 当前 agent 的授权配置快照。
   */
  config: ChatAuthorizationConfig;

  /**
   * 已观测用户列表。
   */
  users: ChatAuthorizationObservedUser[];

  /**
   * 已观测会话列表。
   */
  chats: ChatAuthorizationObservedChat[];

  /**
   * 当前 pending pairing 请求列表。
   */
  pairingRequests: ChatAuthorizationPairingRequest[];
}
