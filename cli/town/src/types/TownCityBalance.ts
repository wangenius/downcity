/**
 * Town City user 余额与充值类型。
 *
 * 关键点（中文）
 * - 这些类型只描述 Town CLI 用户侧展示与调用结果。
 * - `balance` 是 microcredits 整数；`balance_microcredits` 是同值的显式说明字段。
 * - 真实余额账户、充值单与支付记录仍由 City 的 balance/payment 服务定义。
 */

/**
 * 当前登录用户的余额账户摘要。
 */
export interface TownCityBalanceAccount extends Record<string, unknown> {
  /**
   * City 用户 ID。
   */
  user_id: string;

  /**
   * 当前可用余额，单位为 microcredits。
   */
  balance: number;

  /**
   * 当前可用余额，单位为 microcredits。
   */
  balance_microcredits: number;

  /**
   * 账户创建时间。
   */
  created_at: string;

  /**
   * 账户最近更新时间。
   */
  updated_at: string;
}

/**
 * 当前登录用户创建的充值单摘要。
 */
export interface TownCityBalanceTopup extends Record<string, unknown> {
  /**
   * 充值单 ID。
   */
  topup_id: string;

  /**
   * City 用户 ID。
   */
  user_id: string;

  /**
   * 充值金额。
   */
  amount: number;

  /**
   * 充值金额，单位为 microcredits。
   */
  amount_microcredits: number;

  /**
   * 充值单状态。
   */
  status: string;

  /**
   * 充值说明。
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
   * 充值单创建时间。
   */
  created_at: string;

  /**
   * 充值单更新时间。
   */
  updated_at: string;
}

/**
 * 支付 checkout 创建结果。
 */
export interface TownCityCheckoutResult extends Record<string, unknown> {
  /**
   * 支付服务内部记录 ID。
   */
  payment_id?: string;

  /**
   * 对应的充值单 ID。
   */
  topup_id?: string;

  /**
   * 第三方支付 checkout session ID。
   */
  stripe_checkout_session_id?: string;

  /**
   * 可直接打开的 checkout URL。
   */
  checkout_url?: string;

  /**
   * 当前支付状态。
   */
  status?: string;
}

/**
 * 当前登录用户充值流程结果。
 */
export interface TownCityRechargeResult {
  /**
   * 充值单。
   */
  topup: TownCityBalanceTopup;

  /**
   * 支付 checkout 创建结果。
   */
  checkout: TownCityCheckoutResult;

  /**
   * 使用的支付方式 ID。
   */
  method_id: string;

  /**
   * 是否成功打开浏览器。
   */
  opened: boolean;
}

/**
 * 当前登录用户充值输入。
 */
export interface TownCityRechargeInput {
  /**
   * 充值金额。
   */
  amount: number;

  /**
   * 支付方式 ID。
   */
  method_id?: string;

  /**
   * 充值说明。
   */
  note?: string;

  /**
   * 外部引用 ID。
   */
  ref?: string;

  /**
   * 是否自动打开 checkout URL。
   */
  open_checkout?: boolean;
}
