/**
 * 统一账户 Token 响应类型。
 *
 * 关键点（中文）
 * - 明文 token 只在签发时返回一次。
 * - 列表与详情接口一律只返回摘要，不返回明文。
 */

/**
 * 对外返回的 token 摘要。
 */
export interface AuthTokenSummary {
  /**
   * token 记录 ID。
   */
  id: string;
  /**
   * token 名称。
   */
  name: string;
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
 * 新签发 token 的一次性返回结构。
 */
export interface AuthIssuedToken extends AuthTokenSummary {
  /**
   * 明文 Bearer Token。
   */
  token: string;
}

