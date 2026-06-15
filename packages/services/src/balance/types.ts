/**
 * Balance 服务对外类型定义。
 *
 * 关键说明（中文）
 * - 存储与计算使用 microcredits，1 credit = 1_000_000 microcredits
 * - API 中 `balance` / `balance_after` 表示 microcredits 整数
 * - `balance_microcredits` / `balance_after_microcredits` 是同值的显式说明字段
 * - `amount` 仍表示用户可理解的 credits 金额，`amount_microcredits` 表示精确整数金额
 * - `redeem_code` 是一次性兑换码，用于直接给用户充值
 * - 充值单 `topup` 与 `redeem_code` 是两条不同语义的充值链路
 */

/**
 * Balance 服务配置。
 */
export interface BalanceServiceOptions {
  /**
   * 首次自动开户时要发放的初始余额，单位为 credits。
   *
   * 默认值为 `0`。允许最多 6 位小数，内部会转成 microcredits。
   */
  init?: number;

  /**
   * 首次自动开户时要发放的初始余额，单位为 microcredits。
   *
   * 设置后优先级高于 `init`。
   */
  init_microcredits?: number;

}

/**
 * 余额附加信息。
 */
export interface BalanceExtra {
  /**
   * 写入流水、充值单或兑换码的人类可读说明。
   */
  note?: string;

  /**
   * 外部引用 ID。
   *
   * 例如业务请求 ID、订单 ID、支付回调 ID。
   */
  ref?: string;

  /**
   * 结构化扩展字段。
   *
   * 服务会序列化为 JSON 文本存储。
   */
  meta?: Record<string, unknown>;
}

/**
 * 余额流水类型。
 */
export type BalanceLedgerKind = "init" | "add" | "sub" | "topup" | "redeem";

/**
 * 充值单状态。
 */
export type BalanceTopupStatus = "pending" | "paid" | "canceled";

/**
 * redeem_code 状态。
 */
export type BalanceRedeemCodeStatus = "active" | "redeemed" | "disabled";

/**
 * 用户余额账户。
 */
export interface BalanceAccount extends Record<string, unknown> {
  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 当前可用余额，单位为 microcredits。
   *
   * 说明：为了让 API 的余额语义明确，`balance` 本身就是 microcredits；
   * `balance_microcredits` 保留为同值的显式别名。
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
 * 余额流水记录。
 */
export interface BalanceLedgerEntry extends Record<string, unknown> {
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
  kind: BalanceLedgerKind;

  /**
   * 本次变动金额，单位为 credits。
   *
   * 约定：
   * - 加款为正数
   * - 扣款为负数
   */
  amount: number;

  /**
   * 本次变动金额，单位为 microcredits。
   */
  amount_microcredits: number;

  /**
   * 本次变动后的余额快照，单位为 microcredits。
   *
   * 说明：`balance_after` 本身就是 microcredits；
   * `balance_after_microcredits` 保留为同值的显式别名。
   */
  balance_after: number;

  /**
   * 本次变动后的余额快照，单位为 microcredits。
   */
  balance_after_microcredits: number;

  /**
   * 流水说明。
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
   * 流水创建时间。
   */
  created_at: string;
}

/**
 * 充值单。
 */
export interface BalanceTopup extends Record<string, unknown> {
  /**
   * 充值单 ID。
   */
  topup_id: string;

  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 充值金额，单位为 credits。
   */
  amount: number;

  /**
   * 充值金额，单位为 microcredits。
   */
  amount_microcredits: number;

  /**
   * 充值金额，单位为 USD cents。
   */
  amount_usd_cents: number;

  /**
   * 当前状态。
   */
  status: BalanceTopupStatus;

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
 * redeem_code 记录。
 */
export interface BalanceRedeemCode extends Record<string, unknown> {
  /**
   * redeem_code 主键。
   */
  redeem_code_id: string;

  /**
   * 充值金额，单位为 credits。
   */
  amount: number;

  /**
   * 充值金额，单位为 microcredits。
   */
  amount_microcredits: number;

  /**
   * 当前状态。
   */
  status: BalanceRedeemCodeStatus;

  /**
   * 脱敏后的兑换码文本。
   */
  code_mask: string;

  /**
   * redeem_code 说明。
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
   *
   * 未兑换时为空字符串。
   */
  redeemed_by_user_id: string;

  /**
   * 兑换时间。
   *
   * 未兑换时为空字符串。
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
 * 管理端创建 redeem_code 的输入。
 */
export interface BalanceCreateRedeemCodeInput extends BalanceExtra {
  /**
   * 兑换成功后要充值到用户账户的额度，单位为 credits。
   */
  amount: number;

  /**
   * 兑换成功后要充值到用户账户的额度，单位为 microcredits。
   */
  amount_microcredits?: number;

  /**
   * 可选自定义兑换码明文。
   *
   * 为空时由系统自动生成。
   */
  code?: string;
}

/**
 * 创建 redeem_code 后返回的结果。
 */
export interface BalanceRedeemCodeIssueResult extends BalanceRedeemCode {
  /**
   * redeem_code 明文。
   *
   * 只在创建时返回一次，后续列表接口不会再返回。
   */
  code: string;
}

/**
 * 用户兑换 redeem_code 成功后的结果。
 */
export interface BalanceRedeemCodeRedeemResult extends Record<string, unknown> {
  /**
   * 兑换成功后的最新账户快照。
   */
  account: BalanceAccount;

  /**
   * 被兑换的 redeem_code 记录。
   */
  redeem_code: BalanceRedeemCode;
}

/**
 * 历史查询条件。
 */
export interface BalanceHistoryQuery {
  /**
   * 可选用户 ID。
   *
   * 为空时返回全局流水。
   */
  user_id?: string;

  /**
   * 返回条数上限。
   */
  limit?: number | string;
}

/**
 * 充值单查询条件。
 */
export interface BalanceTopupQuery {
  /**
   * 可选用户 ID。
   *
   * 为空时返回全局充值单。
   */
  user_id?: string;

  /**
   * 返回条数上限。
   */
  limit?: number | string;
}

/**
 * redeem_code 查询条件。
 */
export interface BalanceRedeemCodeQuery {
  /**
   * 可选兑换状态。
   *
   * 为空时返回所有状态。
   */
  status?: BalanceRedeemCodeStatus | string;

  /**
   * 可选兑换用户 ID。
   *
   * 为空时返回所有用户。
   */
  user_id?: string;

  /**
   * 返回条数上限。
   */
  limit?: number | string;
}
