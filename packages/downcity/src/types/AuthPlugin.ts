/**
 * Auth Plugin 类型与契约定义。
 *
 * 关键点（中文）
 * - 统一维护 auth plugin 的领域类型、plugin point/action 名称、payload 契约。
 * - 业务层不应散落硬编码字符串，如 `chat.authorizeIncoming`、`set-user-role`。
 * - chat / console / plugin 执行链路都从这里共享同一份边界定义。
 */

import type { ChatDispatchChannel } from "@services/chat/types/ChatDispatcher.js";
import { CHAT_PLUGIN_POINTS } from "@services/chat/runtime/PluginPoints.js";

/**
 * auth plugin 稳定名称。
 */
export const AUTH_PLUGIN_NAME = "auth";

/**
 * auth 支持的渠道目录。
 */
export const CHAT_AUTHORIZATION_CHANNELS = ["telegram", "feishu", "qq"] as const;

/**
 * 鉴权渠道类型。
 */
export type ChatAuthorizationChannel = (typeof CHAT_AUTHORIZATION_CHANNELS)[number];

/**
 * auth plugin 点名称集合。
 */
export const AUTH_PLUGIN_POINTS = {
  observePrincipal: CHAT_PLUGIN_POINTS.observePrincipal,
  authorizeIncoming: CHAT_PLUGIN_POINTS.authorizeIncoming,
  resolveUserRole: CHAT_PLUGIN_POINTS.resolveUserRole,
} as const;

/**
 * auth action 名称集合。
 */
export const AUTH_ACTIONS = {
  snapshot: "snapshot",
  readConfig: "read-config",
  writeConfig: "write-config",
  setUserRole: "set-user-role",
} as const;

/**
 * 可配置的授权权限目录。
 */
export const CHAT_AUTHORIZATION_PERMISSIONS = [
  "chat.dm.use",
  "chat.group.use",
  "auth.manage.users",
  "auth.manage.roles",
  "agent.view.logs",
  "agent.manage",
] as const;

/**
 * 可配置的授权权限。
 */
export type ChatAuthorizationPermission = (typeof CHAT_AUTHORIZATION_PERMISSIONS)[number];

/**
 * 权限展示文案映射。
 */
export const CHAT_AUTHORIZATION_PERMISSION_LABELS: Record<
  ChatAuthorizationPermission,
  string
> = {
  "chat.dm.use": "DM",
  "chat.group.use": "Group",
  "auth.manage.users": "Users",
  "auth.manage.roles": "Roles",
  "agent.view.logs": "Logs",
  "agent.manage": "Agent",
};

/**
 * 权限说明文案映射。
 */
export const CHAT_AUTHORIZATION_PERMISSION_DESCRIPTIONS: Record<
  ChatAuthorizationPermission,
  string
> = {
  "chat.dm.use": "允许用户在私聊场景中直接向 agent 发送请求并得到响应。",
  "chat.group.use": "允许用户在群聊或频道场景中触发 agent 执行对话与任务。",
  "auth.manage.users": "允许修改用户与权限组之间的绑定关系。",
  "auth.manage.roles": "允许编辑权限组定义，以及调整各渠道的新用户默认组。",
  "agent.view.logs": "允许查看当前 agent 的运行日志与排障信息。",
  "agent.manage": "允许执行高权限管理动作，例如变更配置、操作服务与任务。",
};

/**
 * 单个权限展示元信息。
 */
export interface ChatAuthorizationPermissionMeta {
  /**
   * 权限稳定标识。
   */
  permission: ChatAuthorizationPermission;

  /**
   * 权限展示名。
   */
  name: string;

  /**
   * 权限说明。
   */
  description: string;
}

/**
 * auth 目录快照。
 */
export interface ChatAuthorizationCatalog {
  /**
   * auth 支持的渠道列表。
   */
  channels: ChatAuthorizationChannel[];

  /**
   * 权限列表。
   */
  permissions: ChatAuthorizationPermission[];

  /**
   * 权限展示文案映射。
   */
  permissionLabels: Record<ChatAuthorizationPermission, string>;

  /**
   * 权限展示元信息。
   */
  permissionMeta: Record<ChatAuthorizationPermission, ChatAuthorizationPermissionMeta>;
}

/**
 * auth 统一目录常量。
 */
export const CHAT_AUTHORIZATION_CATALOG: ChatAuthorizationCatalog = {
  channels: [...CHAT_AUTHORIZATION_CHANNELS],
  permissions: [...CHAT_AUTHORIZATION_PERMISSIONS],
  permissionLabels: { ...CHAT_AUTHORIZATION_PERMISSION_LABELS },
  permissionMeta: Object.fromEntries(
    CHAT_AUTHORIZATION_PERMISSIONS.map((permission) => [
      permission,
      {
        permission,
        name: CHAT_AUTHORIZATION_PERMISSION_LABELS[permission],
        description: CHAT_AUTHORIZATION_PERMISSION_DESCRIPTIONS[permission],
      },
    ]),
  ) as Record<ChatAuthorizationPermission, ChatAuthorizationPermissionMeta>,
};

/**
 * 单个角色定义。
 */
export interface ChatAuthorizationRole {
  /**
   * 角色唯一标识。
   */
  roleId: string;

  /**
   * 角色展示名。
   */
  name: string;

  /**
   * 角色说明。
   */
  description?: string;

  /**
   * 角色拥有的权限集合。
   */
  permissions: ChatAuthorizationPermission[];
}

/**
 * 构建默认权限组。
 */
export function createDefaultChatAuthorizationRoles(): Record<string, ChatAuthorizationRole> {
  return {
    default: {
      roleId: "default",
      name: "Default",
      description: "新用户的起始权限组，不授予任何消息或管理能力。",
      permissions: [],
    },
    member: {
      roleId: "member",
      name: "Member",
      description: "标准协作者，可在私聊与群聊中使用 agent。",
      permissions: ["chat.dm.use", "chat.group.use"],
    },
    admin: {
      roleId: "admin",
      name: "Admin",
      description: "完全管理权限，可调整授权、查看日志并执行 agent 管理动作。",
      permissions: [...CHAT_AUTHORIZATION_PERMISSIONS],
    },
  };
}

/**
 * 判断给定值是否为 auth 支持的渠道。
 */
export function isChatAuthorizationChannel(
  value: unknown,
): value is ChatAuthorizationChannel {
  return CHAT_AUTHORIZATION_CHANNELS.includes(
    String(value || "").trim().toLowerCase() as ChatAuthorizationChannel,
  );
}

/**
 * 单个渠道的授权配置。
 */
export interface ChatChannelAuthorizationConfig {
  /**
   * 新用户默认角色 ID。
   */
  defaultUserRoleId?: string;

  /**
   * 用户角色绑定表。
   */
  userRoles?: Record<string, string>;
}

/**
 * 授权总配置。
 */
export interface ChatAuthorizationConfig {
  /**
   * 全局角色定义表。
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
}

/**
 * plugin effect 输入：记录观测主体。
 */
export interface AuthObservePrincipalPayload {
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * 当前会话 ID。
   */
  chatId: string;
  /**
   * 当前会话类型。
   */
  chatType?: string;
  /**
   * 当前会话展示名。
   */
  chatTitle?: string;
  /**
   * 当前用户 ID。
   */
  userId?: string;
  /**
   * 当前用户展示名。
   */
  username?: string;
}

/**
 * plugin effect 输出：记录观测主体结果。
 */
export interface AuthObservePrincipalResult {
  /**
   * 是否成功落盘。
   */
  observed: true;
}

/**
 * plugin resolve 输入：查询用户角色。
 */
export interface AuthResolveUserRolePayload {
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * 用户 ID。
   */
  userId?: string;
}

/**
 * action: 覆盖写入配置输入。
 */
export interface AuthWriteConfigPayload {
  /**
   * 新配置。
   */
  config: ChatAuthorizationConfig;
}

/**
 * action: 设置用户角色输入。
 */
export interface AuthSetUserRolePayload {
  /**
   * 当前渠道。
   */
  channel: ChatDispatchChannel;
  /**
   * 用户 ID。
   */
  userId: string;
  /**
   * 目标角色 ID。
   */
  roleId: string;
}
