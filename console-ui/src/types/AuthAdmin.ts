/**
 * Console UI 统一账户管理类型。
 *
 * 关键点（中文）
 * - 收口多用户与 token 管理页使用的接口结构。
 * - 与通用 Dashboard 类型分离，避免主类型文件继续膨胀。
 */

/**
 * Console UI 可见的角色目录项。
 */
export interface UiAuthAdminRoleCatalogItem {
  /**
   * 角色唯一名称。
   */
  name: string

  /**
   * 角色说明。
   */
  description: string

  /**
   * 该角色包含的权限 key 列表。
   */
  permissions: string[]
}

/**
 * Console UI 可见的统一账户用户摘要。
 */
export interface UiAuthAdminUserSummary {
  /**
   * 用户主键 ID。
   */
  id: string

  /**
   * 登录用户名。
   */
  username: string

  /**
   * 展示名称。
   */
  displayName?: string

  /**
   * 当前用户状态。
   */
  status: "active" | "disabled"

  /**
   * 当前用户角色名列表。
   */
  roles: string[]

  /**
   * 当前用户展开后的权限列表。
   */
  permissions: string[]

  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string

  /**
   * 最近更新时间（ISO 字符串）。
   */
  updatedAt: string
}

/**
 * Token 摘要。
 */
export interface UiAuthAdminTokenSummary {
  /**
   * token 记录 ID。
   */
  id: string

  /**
   * token 名称。
   */
  name: string

  /**
   * 过期时间。
   */
  expiresAt?: string

  /**
   * 吊销时间。
   */
  revokedAt?: string

  /**
   * 最近使用时间。
   */
  lastUsedAt?: string

  /**
   * 创建时间（ISO 字符串）。
   */
  createdAt: string

  /**
   * 最近更新时间（ISO 字符串）。
   */
  updatedAt: string
}

/**
 * 一次性签发 token 响应。
 */
export interface UiAuthAdminIssuedToken extends UiAuthAdminTokenSummary {
  /**
   * 明文 Bearer Token，仅签发时返回一次。
   */
  token: string
}

/**
 * 用户目录接口返回体。
 */
export interface UiAuthAdminUsersResponse {
  /**
   * 当前可分配角色目录。
   */
  roles: UiAuthAdminRoleCatalogItem[]

  /**
   * 当前用户列表。
   */
  users: UiAuthAdminUserSummary[]
}

/**
 * 单用户 token 目录返回体。
 */
export interface UiAuthAdminUserTokensResponse {
  /**
   * 当前选中的用户摘要。
   */
  user: UiAuthAdminUserSummary

  /**
   * 当前选中用户的 token 列表。
   */
  tokens: UiAuthAdminTokenSummary[]
}

/**
 * 代用户签发 token 的返回体。
 */
export interface UiAuthAdminIssuedUserTokenResponse {
  /**
   * 当前选中的用户摘要。
   */
  user: UiAuthAdminUserSummary

  /**
   * 新签发 token 的一次性返回结构。
   */
  token: UiAuthAdminIssuedToken
}
