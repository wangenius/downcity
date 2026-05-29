/**
 * Product / Token 类型（对应 core service/products/types.ts + core/auth/types.ts）。
 */

/** Product 记录 */
export interface Product {
  product_id: string;
  name: string;
  status: "active" | "paused";
  created_at: string;
  updated_at: string;
}

/** 创建 Product 的输入 */
export interface ProductCreateInput {
  name: string;
  product_id?: string;
}

/** 签发 token 的输入 */
export interface TokenApplyInput {
  product_id: string;
  user_id: string;
  metadata?: Record<string, unknown>;
  ttl?: string | number;
}

/** token 签发结果 */
export interface TokenApplyResult {
  /** 可交给 UserClient 使用的 token */
  user_token: string;
  /** token 所属 Product ID */
  product_id: string;
  /** token 所属用户 ID */
  user_id: string;
  /** token 过期时间；未设置 ttl 时省略 */
  expires_at?: string;
}
