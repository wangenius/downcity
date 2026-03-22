/**
 * Chat 授权模型类型定义。
 *
 * 关键点（中文）
 * - 授权核心模型改为：角色（role）+ 权限（permission）+ 绑定（binding）。
 * - 新用户与新群会落到默认角色，不再走 pairing / 审批流程。
 * - 静态配置保存在 console `ship.db`，运行时观测数据仍落本地 state.json。
 */

import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";

/**
 * 可配置的授权权限。
 *
 * 说明（中文）
 * - `chat.dm.use`：允许该角色用户在私聊触发 agent。
 * - `chat.group.use`：允许该角色用户在群聊/频道触发 agent。
 * - `auth.manage.users`：允许管理用户/群的角色归属。
 * - `auth.manage.roles`：允许编辑角色与角色权限。
 * - `agent.view.logs`：允许查看 agent 日志等较高读权限。
 * - `agent.manage`：允许进行 runtime/配置等管理动作。
 */
export type ChatAuthorizationPermission =
  | "chat.dm.use"
  | "chat.group.use"
  | "auth.manage.users"
  | "auth.manage.roles"
  | "agent.view.logs"
  | "agent.manage";

/**
 * 单个角色定义。
 */
export interface ChatAuthorizationRole {
  /**
   * 角色唯一标识。
   *
   * 说明（中文）
   * - 例如：`default`、`member`、`admin`。
   */
  roleId: string;

  /**
   * 角色展示名。
   */
  name: string;

  /**
   * 角色拥有的权限集合。
   */
  permissions: ChatAuthorizationPermission[];
}

/**
 * 单个渠道的授权配置。
 */
export interface ChatChannelAuthorizationConfig {
  /**
   * 新用户默认角色 ID。
   *
   * 说明（中文）
   * - 当某个用户没有显式绑定角色时，自动使用该角色。
   */
  defaultUserRoleId?: string;

  /**
   * 用户角色绑定表。
   *
   * 说明（中文）
   * - key 为平台原始 userId。
   * - value 为目标 `roleId`。
   */
  userRoles?: Record<string, string>;

}

/**
 * chat 授权总配置。
 */
export interface ChatAuthorizationConfig {
  /**
   * 全局角色定义表。
   *
   * 说明（中文）
   * - 角色不按平台拆分，所有平台共享同一套角色与权限模型。
   * - 平台差异只体现在用户/会话绑定关系上。
   */
  roles?: Record<string, ChatAuthorizationRole>;

  /**
   * 各渠道授权绑定配置。
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
   * 当前会话展示名。
   */
  chatTitle?: string;
}

/**
 * 授权判定结果。
 */
export type ChatAuthorizationDecision = "allow" | "block";

/**
 * 运行时授权结果。
 */
export interface ChatAuthorizationEvaluateResult {
  /**
   * 最终判定结果。
   */
  decision: ChatAuthorizationDecision;

  /**
   * 当前用户是否拥有高权限。
   */
  isOwner: boolean;

  /**
   * 当前用户匹配到的角色 ID。
   */
  userRoleId: string;

  /**
   * 当前用户匹配到的权限列表。
   */
  userPermissions: ChatAuthorizationPermission[];

  /**
   * 结果原因。
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
 * 授权快照。
 */
export interface ChatAuthorizationSnapshot {
  /**
   * 当前静态授权配置。
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
   * 兼容字段。
   *
   * 说明（中文）
   * - 角色模型下已不再使用 pairing，这里固定为空数组供旧 UI/接口平滑降级。
   */
  pairingRequests: [];
}

/**
 * 运行时状态文件结构。
 */
export interface ChatAuthorizationStateFile {
  /**
   * 状态文件版本号。
   */
  v: 1;

  /**
   * 最近更新时间戳（毫秒）。
   */
  updatedAt: number;

  /**
   * 用户快照索引。
   */
  usersByKey: Record<string, ChatAuthorizationObservedUser>;

  /**
   * 会话快照索引。
   */
  chatsByKey: Record<string, ChatAuthorizationObservedChat>;

  /**
   * 兼容字段。
   */
  pairingRequestsByKey: Record<string, never>;
}
