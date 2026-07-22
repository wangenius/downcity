/**
 * Bureau 公共类型模块。
 *
 * Bureau 是某个 City 部署在独立服务器上的可选后端。它使用 Bureau Token
 * 获取自身 City 上下文，并使用 Federation 公钥在本地验证 user_token。
 */

/** Bureau 使用的标准 fetch 能力。 */
export type BureauFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Bureau Token 可访问的 Federation 服务端能力。 */
export type BureauCapability = "accounts:read";

/** Federation 数据库中的 Bureau Token 记录。 */
export interface BureauTokenRecord extends Record<string, unknown> {
  /** Bureau Token 的公开查找 ID。 */
  token_id: string;

  /** Bureau 所属的唯一 City ID。 */
  city_id: string;

  /** Bureau Token 完整明文的 SHA-256 Base64URL hash。 */
  token_hash: string;

  /** JSON 编码的 Bureau capability 列表。 */
  capabilities: string;

  /** Token 当前状态。 */
  status: "active" | "revoked";

  /** Token 创建时间。 */
  created_at: string;

  /** Token 最后更新时间。 */
  updated_at: string;
}

/** 已通过 Federation 验证的 Bureau 服务端身份。 */
export interface RuntimeBureau {
  /** Bureau Token ID。 */
  token_id: string;

  /** Bureau 所属的唯一 City ID。 */
  city_id: string;

  /** Bureau 被授予的 Federation 能力。 */
  capabilities: BureauCapability[];
}

/** Federation 管理端登记 Bureau Token 的输入。 */
export interface RegisterBureauTokenInput {
  /** CLI 生成的 Bureau Token 查找 ID。 */
  token_id: string;

  /** CLI 对完整 Bureau Token 计算的 SHA-256 Base64URL hash。 */
  token_hash: string;

  /** Bureau 所属的唯一 City ID。 */
  city_id: string;

  /** Bureau capability；默认允许读取用户账户数据。 */
  capabilities?: BureauCapability[];
}

/** Federation 服务端列出的 Bureau Token 元数据。 */
export interface BureauTokenSummary {
  /** Bureau Token 的公开查找 ID。 */
  token_id: string;

  /** Bureau 所属的唯一 City ID。 */
  city_id: string;

  /** Bureau capability。 */
  capabilities: BureauCapability[];

  /** Token 当前状态。 */
  status: "active" | "revoked";

  /** Token 创建时间。 */
  created_at: string;

  /** Token 最后更新时间。 */
  updated_at: string;
}

/** Bureau 从 Federation 获取的可信运行上下文。 */
export interface BureauContext {
  /** Bureau Token ID。 */
  token_id: string;

  /** Bureau 所属的唯一 City ID。 */
  city_id: string;

  /** Bureau 被授予的 Federation 能力。 */
  capabilities: BureauCapability[];
}

/** Bureau 构造参数。 */
export interface BureauOptions {
  /** 预先信任的 Federation HTTP 入口地址。 */
  federation_url: string;

  /** Federation 注册表中属于该 City 后端的 Bureau Token。 */
  bureau_token: string;

  /** 自定义 fetch 实现。 */
  fetch?: BureauFetch;

  /** Federation 上下文与 JWKS 的本地缓存时间，单位毫秒。 */
  jwks_cache_ttl?: number;
}

/** Bureau 本地验签后得到的 Federation 用户身份。 */
export interface BureauIdentity {
  /** Federation 用户 ID，来源于已验证 JWT。 */
  user_id: string;

  /** 与当前 Bureau 注册记录一致的 City ID。 */
  city_id: string;

  /** user_token 中携带的可信业务元数据。 */
  metadata: Record<string, unknown>;

  /** user_token 唯一 ID，来源于 JWT jti。 */
  token_id: string;

  /** user_token 过期时间，Unix 秒。 */
  expires_at: number;
}
