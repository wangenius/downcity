/**
 * Balance 服务对外类型定义。
 *
 * 关键说明（中文）
 * - credits 是唯一账务单位，1 USD = 1_000_000 credits
 * - `credits` / `credits_delta` / `credits_after` 的数值单位均为 credits 整数
 * - 用户侧 `/v1/balance/me` 以 `credits` 作为主字段，并附带 USD 展示信息
 * - `redeem_code` 是一次性兑换码，用于直接给用户充值
 * - 充值单 `topup` 与 `redeem_code` 是两条不同语义的充值链路
 */

import type { Context, HookFn } from "@downcity/city";

/**
 * Balance 服务配置。
 */
export interface BalanceServiceOptions {
  /**
   * 首次自动开户时要发放的初始余额，单位为 credits。
   * 默认值为 `0`。
   */
  init_credits?: number;
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
 * 动态计算前置余额检查额度的方法。
 */
export type BalancePrecheckCreditsResolver = (
  ctx: Context,
) => number | false | undefined | Promise<number | false | undefined>;

/**
 * 动态计算前置余额检查用户 ID 的方法。
 */
export type BalancePrecheckUserResolver = (
  ctx: Context,
) => string | undefined | Promise<string | undefined>;

/**
 * 余额前置检查 hook 配置。
 */
export interface BalancePrecheckHookOptions {
  /**
   * 本次执行要求用户至少持有的余额，单位为 credits。
   *
   * 默认值为 `0`，表示只拦截已经欠费的用户。
   * 返回 `false` 或 `undefined` 时跳过本次检查。
   */
  needed_credits?: number | BalancePrecheckCreditsResolver;

  /**
   * 被检查余额的用户 ID。
   *
   * 默认读取 `ctx.user.user_id`。后台任务、admin 代执行或任务归属用户场景
   * 可以通过该字段显式指定。
   */
  user_id?: string | BalancePrecheckUserResolver;
}

/**
 * 余额前置检查 hook。
 */
export type BalancePrecheckHook = HookFn;

/**
 * 余额流水类型。
 */
export type BalanceLedgerKind = "init" | "add" | "sub" | "topup" | "redeem" | "charge";

/**
 * 通用扣费状态。
 */
export type BalanceChargeStatus = "settled";

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
   * 当前可用余额，单位为 credits。
   */
  credits: number;

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
 * credits 与 USD 换算说明。
 */
export interface BalanceCreditsConversion extends Record<string, unknown> {
  /**
   * 1 USD 对应多少 credits。
   */
  credits_per_usd: number;

  /**
   * USD 展示最多保留的小数位数。
   */
  usd_decimals: number;
}

/**
 * 用户侧余额展示对象。
 */
export interface BalanceUserBalance extends Record<string, unknown> {
  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 当前余额，单位为 credits。
   */
  credits: number;

  /**
   * 主余额字段的单位。
   */
  unit: "credits";

  /**
   * 当前余额换算后的 USD 数字。
   */
  usd: number;

  /**
   * credits 与 USD 的换算说明。
   */
  conversion: BalanceCreditsConversion;

  /**
   * 适合直接展示给用户的 USD 文本。
   */
  display: string;

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
   * 本次变动的 credits。
   *
   * 约定：
   * - 加款为正数
   * - 扣款为负数
   */
  credits_delta: number;

  /**
   * 本次变动后的余额快照，单位为 credits。
   */
  credits_after: number;

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
   * 充值额度，单位为 credits。
   */
  credits: number;

  /**
   * 充值金额，单位为 USD cents。
   */
  usd_cents: number;

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
   * 充值额度，单位为 credits。
   */
  credits: number;

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
  credits: number;

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
 * 通用扣费输入。
 */
export interface BalanceChargeInput extends BalanceExtra {
  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 扣费额度，单位为 credits。
   */
  credits: number;

  /**
   * 结构化扣费审计信息。
   *
   * AI、插件、任务、订单等业务字段都应该放在这里，
   * BalanceService 不解析这些业务字段。
   */
  metadata?: Record<string, unknown>;

  /**
   * 可选稳定幂等键。
   *
   * 同一个幂等键重复提交时返回首次成功的扣费记录，不会再次扣减余额。
   */
  idempotency_key?: string;
}

/**
 * 通用扣费记录。
 */
export interface BalanceCharge extends Record<string, unknown> {
  /**
   * 扣费记录 ID。
   */
  charge_id: string;

  /**
   * 用户 ID。
   */
  user_id: string;

  /**
   * 扣费额度，单位为 credits。
   */
  credits: number;

  /**
   * 扣费状态。
   */
  status: BalanceChargeStatus;

  /**
   * 扣费说明。
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
   * 扣费创建时间。
   */
  created_at: string;
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

/**
 * 通用扣费记录查询条件。
 */
export interface BalanceChargeQuery {
  /**
   * 可选用户 ID。
   *
   * 为空时返回全局扣费记录。
   */
  user_id?: string;

  /**
   * 返回条数上限。
   */
  limit?: number | string;
}
