/**
 * 统一账户领域基础类型。
 *
 * 关键点（中文）
 * - 这些类型描述的是 auth 表记录与运行时 principal，不承载路由细节。
 * - 所有字段都保持可序列化，便于 API 响应与审计日志复用。
 */

import type { AuthPermissionKey } from "./AuthPermission.js";

/**
 * 用户状态。
 */
export type AuthUserStatus = "active" | "disabled";

/**
 * 用户记录。
 */
export interface AuthUser {
  /**
   * 用户主键 ID。
   */
  id: string;
  /**
   * 登录用户名。
   */
  username: string;
  /**
   * 密码哈希值。
   */
  passwordHash: string;
  /**
   * 展示名称。
   */
  displayName?: string;
  /**
   * 用户状态。
   */
  status: AuthUserStatus;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string;
  /**
   * 更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * 角色记录。
 */
export interface AuthRole {
  /**
   * 角色主键 ID。
   */
  id: string;
  /**
   * 角色名。
   */
  name: string;
  /**
   * 角色说明。
   */
  description?: string;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string;
  /**
   * 更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * 权限记录。
 */
export interface AuthPermission {
  /**
   * 权限主键 ID。
   */
  id: string;
  /**
   * 权限 key。
   */
  key: AuthPermissionKey;
  /**
   * 权限说明。
   */
  description?: string;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string;
  /**
   * 更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * Token 记录。
 */
export interface AuthTokenRecord {
  /**
   * token 记录主键 ID。
   */
  id: string;
  /**
   * 所属用户 ID。
   */
  userId: string;
  /**
   * token 名称。
   */
  name: string;
  /**
   * token 哈希值。
   */
  tokenHash: string;
  /**
   * 过期时间（可选）。
   */
  expiresAt?: string;
  /**
   * 吊销时间（可选）。
   */
  revokedAt?: string;
  /**
   * 最近使用时间（可选）。
   */
  lastUsedAt?: string;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string;
  /**
   * 更新时间（ISO 字符串）。
   */
  updatedAt: string;
}

/**
 * 审计日志记录。
 */
export interface AuthAuditLog {
  /**
   * 审计日志主键 ID。
   */
  id: string;
  /**
   * 操作人用户 ID。
   */
  actorUserId?: string;
  /**
   * 操作人 token ID。
   */
  actorTokenId?: string;
  /**
   * 资源类型。
   */
  resourceType: string;
  /**
   * 资源 ID。
   */
  resourceId?: string;
  /**
   * 动作名。
   */
  action: string;
  /**
   * 动作结果。
   */
  result: string;
  /**
   * 请求 ID。
   */
  requestId?: string;
  /**
   * 请求 IP。
   */
  ip?: string;
  /**
   * User-Agent。
   */
  userAgent?: string;
  /**
   * 附加元数据 JSON 字符串。
   */
  metaJson?: string;
  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string;
}

/**
 * 当前请求的认证主体。
 */
export interface AuthPrincipal {
  /**
   * 当前用户 ID。
   */
  userId: string;
  /**
   * 当前用户名。
   */
  username: string;
  /**
   * 当前展示名。
   */
  displayName?: string;
  /**
   * 当前用户状态。
   */
  status: AuthUserStatus;
  /**
   * 当前 token 记录 ID。
   */
  tokenId: string;
  /**
   * 当前 token 名称。
   */
  tokenName: string;
  /**
   * 当前用户角色列表。
   */
  roles: string[];
  /**
   * 当前用户权限列表。
   */
  permissions: AuthPermissionKey[];
}

