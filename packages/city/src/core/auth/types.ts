/**
 * Auth 域公共类型。
 *
 * 包含 token 相关的用户、载荷和签发结果类型。
 */

/**
 * Runtime 中的终端用户信息。
 */
export interface RuntimeUser {
  /**
   * 开发者系统中的用户主键。
   */
  user_id: string;

  /**
   * 附带在 token 中的业务元数据。
   */
  metadata?: Record<string, unknown>;
}

/**
 * 签发 user_token 的输入。
 */
export interface CreateUserTokenInput {
  /**
   * token 所属的 City ID。
   */
  city_id: string;

  /**
   * token 所属的终端用户 ID。
   */
  user_id: string;

  /**
   * 附带进 token 的业务元数据。
   */
  metadata?: Record<string, unknown>;

  /**
   * token 有效期。
   *
   * 支持 `30m`、`1h`、`7d` 或秒数。
   */
  ttl?: string | number;
}

/**
 * user_token 的标准载荷。
 */
export interface UserTokenPayload {
  /**
   * token 受众。
   */
  aud: "downcity:user";

  /**
   * token 所属 City ID。
   */
  city_id: string;

  /**
   * token 所属用户 ID。
   */
  user_id: string;

  /**
   * 业务元数据。
   */
  metadata?: Record<string, unknown>;

  /**
   * 签发时间。
   */
  iat: number;

  /**
   * 过期时间。
   */
  exp?: number;
}

/**
 * City 返回给管理端的发 token 结果。
 */
export interface UserTokenIssueResult {
  /**
   * 可交给 User CityPact 使用的 token。
   */
  user_token: string;

  /**
   * token 所属 City ID。
   */
  city_id: string;

  /**
   * token 所属用户 ID。
   */
  user_id: string;

  /**
   * token 过期时间。
   *
   * 未设置 ttl 时省略。
   */
  expires_at?: string;
}
