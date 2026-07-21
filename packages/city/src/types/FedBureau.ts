/**
 * FedBureau 公共类型模块。
 *
 * FedBureau 面向产品后端，从 HTTP 请求或 user_token 中识别 Federation 用户身份。
 */

/** FedBureau 使用的标准 fetch 能力。 */
export type FedBureauFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** FedBureau 构造参数。 */
export interface FedBureauOptions {
  /**
   * 预先信任的 Federation HTTP 地址。
   *
   * Bureau 只允许从该地址获取 discovery 与 JWKS，不能信任 token 自带的任意地址。
   */
  federation_url: string;

  /**
   * 当前产品后端唯一允许的 City ID。
   *
   * 签名有效但 city_id 不匹配的 token 会被拒绝。
   */
  city_id: string;

  /**
   * 自定义 fetch 实现。
   *
   * 用于测试、Cloudflare Workers 或需要统一网络策略的宿主。
   */
  fetch?: FedBureauFetch;

  /**
   * Federation discovery 与 JWKS 的本地缓存时间，单位毫秒。
   *
   * 默认 5 分钟；遇到未知 kid 时会强制刷新一次。
   */
  jwks_cache_ttl?: number;
}

/** FedBureau 已验证的 Federation 用户身份。 */
export interface FedIdentity {
  /** Federation 用户 ID，来源于 JWT sub。 */
  user_id: string;

  /** 已验证且与 Bureau city_id 一致的 City ID。 */
  city_id: string;

  /** token 中携带的可信业务元数据。 */
  metadata: Record<string, unknown>;

  /** token 唯一 ID，来源于 JWT jti。 */
  token_id: string;

  /** token 过期时间，Unix 秒。 */
  expires_at: number;
}
