/**
 * 统一账户管理面类型。
 *
 * 关键点（中文）
 * - 专门承接“多用户 / 角色 / token 管理”这一层的序列化结构。
 * - 与底层 `AuthTypes` 表记录分离，避免把数据库字段直接暴露给管理 API。
 */

import type { AuthPermissionKey } from "./AuthPermission.js";
import type { AuthIssuedToken, AuthTokenSummary } from "./AuthToken.js";
import type { AuthUserStatus } from "./AuthTypes.js";

/**
 * 管理面可见的角色目录项。
 */
export interface AuthAdminRoleCatalogItem {
  /**
   * 角色唯一名称。
   */
  name: string;
  /**
   * 角色的人类可读说明。
   */
  description: string;
  /**
   * 该角色授予的权限列表。
   */
  permissions: AuthPermissionKey[];
}

/**
 * 管理面返回的用户摘要。
 */
export interface AuthAdminUserSummary {
  /**
   * 用户主键 ID。
   */
  id: string;
  /**
   * 登录用户名。
   */
  username: string;
  /**
   * 展示名称。
   */
  displayName?: string;
  /**
   * 当前用户状态。
   */
  status: AuthUserStatus;
  /**
   * 当前绑定的角色名列表。
   */
  roles: string[];
  /**
   * 当前展开后的权限 key 列表。
   */
  permissions: AuthPermissionKey[];
  /**
   * 用户创建时间（ISO 字符串）。
   */
  createdAt: string;
  /**
   * 用户最近更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * 用户管理列表接口的聚合返回体。
 */
export interface AuthAdminUsersPayload {
  /**
   * 当前系统可分配的角色目录。
   */
  roles: AuthAdminRoleCatalogItem[];
  /**
   * 当前系统中的用户列表。
   */
  users: AuthAdminUserSummary[];
}

/**
 * 单用户 token 列表返回体。
 */
export interface AuthAdminUserTokensPayload {
  /**
   * 目标用户摘要。
   */
  user: AuthAdminUserSummary;
  /**
   * 目标用户名下的 token 摘要列表。
   */
  tokens: AuthTokenSummary[];
}

/**
 * 代用户签发 token 的返回体。
 */
export interface AuthAdminIssuedUserTokenPayload {
  /**
   * 目标用户摘要。
   */
  user: AuthAdminUserSummary;
  /**
   * 新签发 token 的一次性返回结构。
   */
  token: AuthIssuedToken;
}
