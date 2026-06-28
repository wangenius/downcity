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
export const CHARGE_TABLE = "service_balance_charges";

/**
 * SQLite 余额账户表。
 */
export const balanceAccounts = sqliteTable(ACCOUNT_TABLE, {
  /**
   * 用户 ID。
   */
  user_id: text("user_id").primaryKey(),

  /**
   * 当前余额，单位为 credits。
   */
  credits: integer("credits").notNull(),

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
   * 本次 credits 变动，正数为入账，负数为扣减。
   */
  credits_delta: integer("credits_delta").notNull(),

  /**
   * 变动后的余额，单位为 credits。
   */
  credits_after: integer("credits_after").notNull(),

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
   * 充值额度，单位为 credits。
   */
  credits: integer("credits").notNull(),

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
   * 充值额度，单位为 credits。
   */
  credits: integer("credits").notNull(),

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

/**
 * SQLite 通用扣费记录表。
 */
export const balanceCharges = sqliteTable(CHARGE_TABLE, {
  /**
   * 扣费记录 ID。
   */
  charge_id: text("charge_id").primaryKey(),

  /**
   * 用户 ID。
   */
  user_id: text("user_id").notNull(),

  /**
   * 扣费额度，单位为 credits。
   */
  credits: integer("credits").notNull(),

  /**
   * 扣费状态。
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
});
