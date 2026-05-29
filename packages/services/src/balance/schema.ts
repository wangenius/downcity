/**
 * Balance 服务表结构定义。
 *
 * 关键说明（中文）
 * - 账户、流水、充值单与 redeem_code 分表维护
 * - redeem_code 只存哈希与脱敏值，不存历史明文
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const ACCOUNT_TABLE = "service_balance_accounts";
export const LEDGER_TABLE = "service_balance_ledger";
export const TOPUP_TABLE = "service_balance_topups";
export const REDEEM_CODE_TABLE = "service_balance_redeem_codes";

/**
 * SQLite 余额账户表。
 */
export const balanceAccounts = sqliteTable(ACCOUNT_TABLE, {
  /**
   * 用户 ID。
   */
  user_id: text("user_id").primaryKey(),

  /**
   * 当前余额。
   */
  balance: integer("balance").notNull(),

  /**
   * 余额单位。
   */
  unit: text("unit").notNull(),

  /**
   * 创建时间。
   */
  created_at: text("created_at").notNull(),

  /**
   * 更新时间。
   */
  updated_at: text("updated_at").notNull(),
});

/**
 * SQLite 余额流水表。
 */
export const balanceLedger = sqliteTable(LEDGER_TABLE, {
  /**
   * 流水主键。
   */
  entry_id: text("entry_id").primaryKey(),

  /**
   * 用户 ID。
   */
  user_id: text("user_id").notNull(),

  /**
   * 流水类型。
   */
  kind: text("kind").notNull(),

  /**
   * 本次金额变动。
   */
  amount: integer("amount").notNull(),

  /**
   * 变动后的余额。
   */
  balance_after: integer("balance_after").notNull(),

  /**
   * 余额单位。
   */
  unit: text("unit").notNull(),

  /**
   * 可读说明。
   */
  note: text("note").notNull(),

  /**
   * 外部引用 ID。
   */
  ref: text("ref").notNull(),

  /**
   * 扩展字段 JSON。
   */
  metadata_json: text("metadata_json").notNull(),

  /**
   * 创建时间。
   */
  created_at: text("created_at").notNull(),
});

/**
 * SQLite 充值单表。
 */
export const balanceTopups = sqliteTable(TOPUP_TABLE, {
  /**
   * 充值单 ID。
   */
  topup_id: text("topup_id").primaryKey(),

  /**
   * 用户 ID。
   */
  user_id: text("user_id").notNull(),

  /**
   * 充值金额。
   */
  amount: integer("amount").notNull(),

  /**
   * 余额单位。
   */
  unit: text("unit").notNull(),

  /**
   * 充值单状态。
   */
  status: text("status").notNull(),

  /**
   * 可读说明。
   */
  note: text("note").notNull(),

  /**
   * 外部引用 ID。
   */
  ref: text("ref").notNull(),

  /**
   * 扩展字段 JSON。
   */
  metadata_json: text("metadata_json").notNull(),

  /**
   * 创建时间。
   */
  created_at: text("created_at").notNull(),

  /**
   * 更新时间。
   */
  updated_at: text("updated_at").notNull(),
});

/**
 * SQLite redeem_code 表。
 */
export const balanceRedeemCodes = sqliteTable(REDEEM_CODE_TABLE, {
  /**
   * redeem_code 主键。
   */
  redeem_code_id: text("redeem_code_id").primaryKey(),

  /**
   * 兑换码哈希值。
   */
  code_hash: text("code_hash").notNull(),

  /**
   * 兑换码脱敏值。
   */
  code_mask: text("code_mask").notNull(),

  /**
   * 充值金额。
   */
  amount: integer("amount").notNull(),

  /**
   * 余额单位。
   */
  unit: text("unit").notNull(),

  /**
   * redeem_code 状态。
   */
  status: text("status").notNull(),

  /**
   * 可读说明。
   */
  note: text("note").notNull(),

  /**
   * 外部引用 ID。
   */
  ref: text("ref").notNull(),

  /**
   * 扩展字段 JSON。
   */
  metadata_json: text("metadata_json").notNull(),

  /**
   * 兑换用户 ID。
   */
  redeemed_by_user_id: text("redeemed_by_user_id").notNull(),

  /**
   * 兑换时间。
   */
  redeemed_at: text("redeemed_at").notNull(),

  /**
   * 创建时间。
   */
  created_at: text("created_at").notNull(),

  /**
   * 更新时间。
   */
  updated_at: text("updated_at").notNull(),
});
