/**
 * Balance 管理端类型。
 *
 * 关键说明（中文）
 * - 这里描述的是 Admin City 看到的 balance service 结构
 * - redeem_code 明文只在创建结果中返回一次
 */

/**
 * 余额账户记录。
 */
export interface BalanceAccountRecord {
  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 当前余额。
   */
  balance: number;

  /**
   * 余额单位。
   */
  unit: string;

  /**
   * 创建时间。
   */
  created_at: string;

  /**
   * 更新时间。
   */
  updated_at: string;
}

/**
 * 余额流水记录。
 */
export interface BalanceLedgerRecord {
  /**
   * 流水主键。
   */
  entry_id: string;

  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 流水类型。
   */
  kind: "init" | "add" | "sub" | "topup" | "redeem";

  /**
   * 本次变动金额。
   */
  amount: number;

  /**
   * 变动后的余额快照。
   */
  balance_after: number;

  /**
   * 余额单位。
   */
  unit: string;

  /**
   * 说明文本。
   */
  note: string;

  /**
   * 外部引用 ID。
   */
  ref: string;

  /**
   * 扩展字段 JSON 文本。
   */
  metadata_json: string;

  /**
   * 创建时间。
   */
  created_at: string;
}

/**
 * 充值单记录。
 */
export interface BalanceTopupRecord {
  /**
   * 充值单 ID。
   */
  topup_id: string;

  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 充值金额。
   */
  amount: number;

  /**
   * 余额单位。
   */
  unit: string;

  /**
   * 充值单状态。
   */
  status: "pending" | "paid" | "canceled";

  /**
   * 说明文本。
   */
  note: string;

  /**
   * 外部引用 ID。
   */
  ref: string;

  /**
   * 扩展字段 JSON 文本。
   */
  metadata_json: string;

  /**
   * 创建时间。
   */
  created_at: string;

  /**
   * 更新时间。
   */
  updated_at: string;
}

/**
 * redeem_code 记录。
 */
export interface BalanceRedeemCodeRecord {
  /**
   * redeem_code 主键。
   */
  redeem_code_id: string;

  /**
   * 充值金额。
   */
  amount: number;

  /**
   * 余额单位。
   */
  unit: string;

  /**
   * redeem_code 状态。
   */
  status: "active" | "redeemed" | "disabled";

  /**
   * 脱敏后的兑换码文本。
   */
  code_mask: string;

  /**
   * 说明文本。
   */
  note: string;

  /**
   * 外部引用 ID。
   */
  ref: string;

  /**
   * 扩展字段 JSON 文本。
   */
  metadata_json: string;

  /**
   * 被哪个用户兑换。
   */
  redeemed_by_user_id: string;

  /**
   * 兑换时间。
   */
  redeemed_at: string;

  /**
   * 创建时间。
   */
  created_at: string;

  /**
   * 更新时间。
   */
  updated_at: string;
}

/**
 * 创建 redeem_code 的输入。
 */
export interface BalanceRedeemCodeCreateInput {
  /**
   * redeem_code 额度。
   */
  amount: number;

  /**
   * 可选自定义 redeem_code 明文。
   *
   * 不传时由服务端自动生成。
   */
  code?: string;

  /**
   * 说明文本。
   */
  note?: string;

  /**
   * 外部引用 ID。
   */
  ref?: string;

  /**
   * 扩展字段。
   */
  meta?: Record<string, unknown>;
}

/**
 * 创建 redeem_code 的结果。
 */
export interface BalanceRedeemCodeIssueResult extends BalanceRedeemCodeRecord {
  /**
   * redeem_code 明文。
   *
   * 只在创建返回中可见。
   */
  code: string;
}

/**
 * 查询流水的输入。
 */
export interface BalanceHistoryListInput {
  /**
   * 可选用户 ID。
   */
  user_id?: string;

  /**
   * 返回条数上限。
   */
  limit?: string | number;
}

/**
 * 查询充值单的输入。
 */
export interface BalanceTopupListInput {
  /**
   * 可选用户 ID。
   */
  user_id?: string;

  /**
   * 返回条数上限。
   */
  limit?: string | number;
}

/**
 * 查询 redeem_code 的输入。
 */
export interface BalanceRedeemCodeListInput {
  /**
   * 可选兑换状态。
   */
  status?: "active" | "redeemed" | "disabled";

  /**
   * 可选兑换用户 ID。
   */
  user_id?: string;

  /**
   * 返回条数上限。
   */
  limit?: string | number;
}

/**
 * 手动加减余额的输入。
 */
export interface BalanceMutationInput {
  /**
   * 目标用户 ID。
   */
  user_id: string;

  /**
   * 变动额度。
   */
  amount: number;

  /**
   * 说明文本。
   */
  note?: string;

  /**
   * 外部引用 ID。
   */
  ref?: string;

  /**
   * 扩展字段。
   */
  meta?: Record<string, unknown>;
}

/**
 * 完成或取消充值单的输入。
 */
export interface BalanceTopupUpdateInput {
  /**
   * 充值单 ID。
   */
  topup_id: string;

  /**
   * 说明文本。
   */
  note?: string;

  /**
   * 外部引用 ID。
   */
  ref?: string;

  /**
   * 扩展字段。
   */
  meta?: Record<string, unknown>;
}

/**
 * 停用 redeem_code 的输入。
 */
export interface BalanceRedeemCodeDisableInput {
  /**
   * redeem_code ID。
   */
  redeem_code_id: string;

  /**
   * 说明文本。
   */
  note?: string;

  /**
   * 外部引用 ID。
   */
  ref?: string;

  /**
   * 扩展字段。
   */
  meta?: Record<string, unknown>;
}
