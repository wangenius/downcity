/**
 * Bureau 公共类型模块。
 *
 * Bureau 是产品后端与 Federation 管理端统一使用的在线身份客户端。
 */

import type { FetchLike } from "../pact/http.js";

/** Bureau Token 可授予的能力。 */
export type BureauCapability = "accounts:read" | "federation:admin";

/** Federation 数据库中的 Bureau Token 记录。 */
export interface BureauTokenRecord extends Record<string, unknown> {
  /** Bureau Token 的公开查找 ID。 */
  token_id: string;

  /** 便于管理员识别用途的名称。 */
  name: string;

  /** Token 绑定的 City ID；root token 使用空字符串。 */
  city_id: string;

  /** Bureau Token 完整明文的 SHA-256 Base64URL hash。 */
  token_hash: string;

  /** JSON 编码的 Bureau capability 列表。 */
  capabilities: string;

  /** Token 状态。 */
  status: "active" | "revoked";

  /** Token 创建时间。 */
  created_at: string;

  /** Token 最后更新时间。 */
  updated_at: string;
}

/** 已通过 Federation 验证的 Bureau 身份。 */
export interface RuntimeBureau {
  /** Bureau Token ID。 */
  token_id: string;

  /** Bureau 展示名称。 */
  name: string;

  /** Token 绑定的 City ID；root Bureau 为空字符串。 */
  city_id: string;

  /** Bureau 被授予的 capability。 */
  capabilities: BureauCapability[];
}

/** 创建 Bureau Token 的输入。 */
export interface CreateBureauTokenInput {
  /** 便于管理员识别用途的名称。 */
  name: string;

  /** Token 绑定的 City ID；管理型 Token 可以省略。 */
  city_id?: string;

  /** Token capability；默认只允许读取用户身份。 */
  capabilities?: BureauCapability[];
}

/** Bureau Token 签发结果。 */
export interface BureauTokenIssueResult {
  /** 只返回一次的 Bureau Token 明文。 */
  bureau_token: string;

  /** Bureau Token 的公开查找 ID。 */
  token_id: string;

  /** Token 绑定的 City ID；管理型 Token 为空字符串。 */
  city_id: string;

  /** Token capability。 */
  capabilities: BureauCapability[];
}

/** Bureau Token 管理列表项。 */
export interface BureauTokenSummary {
  /** Bureau Token 的公开查找 ID。 */
  token_id: string;

  /** 便于管理员识别用途的名称。 */
  name: string;

  /** Token 绑定的 City ID；管理型 Token 为空字符串。 */
  city_id: string;

  /** Token capability。 */
  capabilities: BureauCapability[];

  /** Token 当前状态。 */
  status: "active" | "revoked";

  /** Token 创建时间。 */
  created_at: string;

  /** Token 最后更新时间。 */
  updated_at: string;
}

/** Bureau 构造参数。 */
export interface BureauOptions {
  /** Federation HTTP 入口地址。 */
  federation_url: string;

  /** Federation 签发的 Bureau Token。 */
  bureau_token: string;

  /** 自定义 fetch 实现。 */
  fetch?: FetchLike;
}

/** Bureau identify 返回的认证用户信息。 */
export interface BureauUserInfo {
  /** Federation 用户 ID。 */
  user_id: string;

  /** 用户认证邮箱。 */
  email: string;

  /** 邮箱是否已验证。 */
  email_verified: boolean;

  /** 认证系统展示名称。 */
  name: string;

  /** 认证系统头像 URL。 */
  image: string | null;
}

/** Bureau identify 返回的用户资料。 */
export interface BureauUserProfile {
  /** Federation 用户 ID。 */
  user_id: string;

  /** 用户资料邮箱。 */
  email: string;

  /** 用户展示名称。 */
  display_name: string;

  /** 用户头像 URL。 */
  avatar_url: string;

  /** 用户个人简介。 */
  bio: string;

  /** 资料创建时间。 */
  created_at: string;

  /** 资料更新时间。 */
  updated_at: string;
}

/** Bureau 在线识别结果。 */
export interface BureauIdentity {
  /** 用户当前是否仍存在于 Federation Accounts。 */
  registered: boolean;

  /** user_token 中的 Federation 用户 ID。 */
  user_id?: string;

  /** user_token 绑定的 City ID。 */
  city_id?: string;

  /** 当前注册用户认证信息。 */
  user?: BureauUserInfo;

  /** 当前注册用户资料；未创建资料时为空。 */
  profile?: BureauUserProfile | null;
}
