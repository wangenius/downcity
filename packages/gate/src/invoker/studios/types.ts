/**
 * Studio / Token 类型（对应 core service/studios/types.ts + core/auth/types.ts）。
 */

/** Studio 记录 */
export interface Studio {
  studio_id: string;
  name: string;
  status: "active" | "paused";
  created_at: string;
  updated_at: string;
}

/** 创建 Studio 的输入 */
export interface StudioCreateInput {
  name: string;
  studio_id?: string;
}

/** 签发 token 的输入 */
export interface TokenApplyInput {
  studio_id: string;
  user_id: string;
  metadata?: Record<string, unknown>;
  ttl?: string | number;
}

/** token 签发结果 */
export interface TokenApplyResult {
  /** 可交给 UserClient 使用的 token */
  user_token: string;
  /** token 所属 Studio ID */
  studio_id: string;
  /** token 所属用户 ID */
  user_id: string;
  /** token 过期时间；未设置 ttl 时省略 */
  expires_at?: string;
}
