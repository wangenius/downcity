/**
 * Console UI Access 工作台类型。
 *
 * 关键点（中文）
 * - 只保留单管理员模型下真正需要的结构：当前 admin 与其 token。
 * - 不再暴露多用户、角色目录或跨用户 token 管理字段。
 */

/**
 * 当前登录管理员摘要。
 */
export interface UiAuthAccessUser {
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
   * 角色列表。
   */
  roles: string[]

  /**
   * 权限列表。
   */
  permissions: string[]
}

/**
 * 当前管理员可见的 token 摘要。
 */
export interface UiAuthAccessTokenSummary {
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
   * 最近使用时间。
   */
  lastUsedAt?: string

  /**
   * 创建时间。
   */
  createdAt: string

  /**
   * 最近更新时间。
   */
  updatedAt: string
}

/**
 * 一次性签发 token 响应。
 */
export interface UiAuthAccessIssuedToken extends UiAuthAccessTokenSummary {
  /**
   * 明文 Bearer Token。
   */
  token: string
}

/**
 * 当前管理员信息接口响应。
 */
export interface UiAuthAccessMeResponse {
  /**
   * 当前管理员摘要。
   */
  user: UiAuthAccessUser
}

/**
 * token 列表接口响应。
 */
export interface UiAuthAccessTokenListResponse {
  /**
   * 当前管理员 token 列表。
   */
  tokens: UiAuthAccessTokenSummary[]
}
