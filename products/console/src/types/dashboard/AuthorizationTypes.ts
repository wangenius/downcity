/**
 * Console Dashboard 授权与权限类型定义。
 *
 * 关键点（中文）
 * - 从 Dashboard.ts 拆出，按业务主题聚合类型，避免单个类型文件继续膨胀。
 * - 字段级文档保留在具体 interface/type 上，方便调用侧悬浮查看。
 */

/**
 * 单个授权角色。
 */
export type UiChatAuthorizationPermission =
  | "chat.dm.use"
  | "chat.group.use"
  | "auth.manage.users"
  | "auth.manage.roles"
  | "agent.view.logs"
  | "agent.manage"
  | string;

/**
 * 单个权限的展示元信息。
 */
export interface UiChatAuthorizationPermissionMeta {
  /**
   * 权限稳定标识。
   */
  permission: UiChatAuthorizationPermission;
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
export interface UiChatAuthorizationCatalog {
  /**
   * auth 支持的渠道列表。
   */
  channels?: string[];
  /**
   * 权限列表。
   */
  permissions?: UiChatAuthorizationPermission[];
  /**
   * 权限展示文案映射。
   */
  permissionLabels?: Record<string, string>;
  /**
   * 权限展示元信息映射。
   */
  permissionMeta?: Record<string, UiChatAuthorizationPermissionMeta>;
}

/**
 * 单个授权角色。
 */
export interface UiChatAuthorizationRole {
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
   * 角色权限列表。
   */
  permissions?: UiChatAuthorizationPermission[];
}

/**
 * 单渠道授权配置。
 */
export interface UiChatAuthorizationChannelConfig {
  /**
   * 新用户默认角色。
   */
  defaultUserRoleId?: string;
  /**
   * 用户角色绑定表。
   */
  userRoles?: Record<string, string>;
}

/**
 * 观测到的授权用户。
 */
export interface UiChatAuthorizationUser {
  /**
   * 渠道名。
   */
  channel: "telegram" | "feishu" | "qq" | string;
  /**
   * 用户 ID。
   */
  userId: string;
  /**
   * 最近一次用户名 / 展示名。
   */
  username?: string;
  /**
   * 最近会话 ID。
   */
  lastChatId?: string;
  /**
   * 最近会话标题。
   */
  lastChatTitle?: string;
  /**
   * 最近会话类型。
   */
  lastChatType?: string;
  /**
   * 首次观测时间戳。
   */
  firstSeenAt?: number;
  /**
   * 最近观测时间戳。
   */
  lastSeenAt?: number;
}

/**
 * 观测到的授权会话。
 */
export interface UiChatAuthorizationChat {
  /**
   * 渠道名。
   */
  channel: "telegram" | "feishu" | "qq" | string;
  /**
   * 会话 ID。
   */
  chatId: string;
  /**
   * 会话标题。
   */
  chatTitle?: string;
  /**
   * 会话类型。
   */
  chatType?: string;
  /**
   * 最近发言用户 ID。
   */
  lastActorId?: string;
  /**
   * 最近发言用户名 / 展示名。
   */
  lastActorName?: string;
  /**
   * 首次观测时间戳。
   */
  firstSeenAt?: number;
  /**
   * 最近观测时间戳。
   */
  lastSeenAt?: number;
}

/**
 * authorization 页面数据快照。
 */
export interface UiChatAuthorizationResponse {
  /**
   * 请求是否成功。
   */
  success?: boolean;
  /**
   * auth 目录快照。
   */
  catalog?: UiChatAuthorizationCatalog;
  /**
   * 授权配置。
   */
  config?: {
    /**
     * 全局角色定义表。
     */
    roles?: Record<string, UiChatAuthorizationRole>;
    /**
     * 按渠道拆分的绑定配置。
     */
    channels?: Partial<Record<string, UiChatAuthorizationChannelConfig>>;
  };
  /**
   * 已观测用户列表。
   */
  users?: UiChatAuthorizationUser[];
  /**
   * 已观测会话列表。
   */
  chats?: UiChatAuthorizationChat[];
}
