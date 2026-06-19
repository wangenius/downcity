/**
 * City City user 余额与充值类型。
 *
 * 关键点（中文）
 * - 这些类型只描述 City CLI 用户侧展示与调用结果。
 * - `balance` / `amount` 的数值单位是 microcredits。
 * - 真实余额账户、充值单与支付记录仍由 City 的 balance/payment 服务定义。
 */

/**
 * 当前登录用户的余额账户摘要。
 */
export interface CityBalanceAccount extends Record<string, unknown> {
  /**
   * City 用户 ID。
   */
  user_id: string;

  /**
   * 当前可用余额，单位为 microcredits。
   */
  balance: number;

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
export interface CityBalanceTopup extends Record<string, unknown> {
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
export interface CityCheckoutResult extends Record<string, unknown> {
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
export interface CityRechargeResult {
  /**
   * 充值单。
   */
  topup: CityBalanceTopup;

  /**
   * 支付 checkout 创建结果。
   */
  checkout: CityCheckoutResult;

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
export interface CityRechargeInput {
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
