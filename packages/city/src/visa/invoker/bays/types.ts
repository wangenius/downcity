/**
 * Bay / Token 类型（对应 core service/bays/types.ts + core/auth/types.ts）。
 */

/** Bay 记录 */
export interface Bay {
  /** Bay 的唯一 ID，User Visa 请求会使用它绑定访问边界。 */
  bay_id: string;

  /** Bay 的展示名称，便于管理端识别不同产品或场景。 */
  name: string;

  /** Bay 当前状态，paused 状态会阻止用户侧继续调用。 */
  status: "active" | "paused";

  /** Bay 创建时间，使用 ISO 字符串。 */
  created_at: string;

  /** Bay 最后更新时间，使用 ISO 字符串。 */
  updated_at: string;
}

/** 创建 Bay 的输入 */
export interface BayCreateInput {
  /** Bay 的展示名称。 */
  name: string;

  /** 可选自定义 Bay ID；不传时由 City 自动生成。 */
  bay_id?: string;
}

/** 签发 token 的输入 */
export interface TokenApplyInput {
  /** token 绑定的 Bay ID。 */
  bay_id: string;

  /** token 绑定的业务用户 ID。 */
  user_id: string;

  /** 写入 token payload 的业务元数据。 */
  metadata?: Record<string, unknown>;

  /** token 有效期，可传毫秒数或可解析的时长字符串。 */
  ttl?: string | number;
}

/** token 签发结果 */
export interface TokenApplyResult {
  /** 可交给 User Visa 使用的 token */
  user_token: string;
  /** token 所属 Bay ID */
  bay_id: string;
  /** token 所属用户 ID */
  user_id: string;
  /** token 过期时间；未设置 ttl 时省略 */
  expires_at?: string;
}
