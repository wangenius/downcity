/**
 * Waffo Pancake 一次性充值服务数据库 schema。
 *
 * 关键说明（中文）
 * - 本服务只管理 Waffo 支付侧事实，不直接维护余额账本
 * - 真正的钱包账户、充值单与流水仍然由 balance 服务负责
 * - 这里的表只负责记录 Waffo Checkout 映射与 webhook 事件
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Waffo 支付记录表。
 */
export const waffoPayments = sqliteTable("service_waffo_payments", {
  payment_id: text("payment_id").primaryKey(),
  topup_id: text("topup_id").notNull(),
  user_id: text("user_id").notNull(),
  waffo_session_id: text("waffo_session_id").notNull(),
  waffo_order_id: text("waffo_order_id").notNull(),
  waffo_payment_id: text("waffo_payment_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  checkout_url: text("checkout_url").notNull(),
  metadata_json: text("metadata_json").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

/**
 * Waffo webhook 事件表。
 */
export const waffoEvents = sqliteTable("service_waffo_events", {
  event_id: text("event_id").primaryKey(),
  type: text("type").notNull(),
  payload_json: text("payload_json").notNull(),
  sync_status: text("sync_status").notNull(),
  sync_error: text("sync_error").notNull(),
  created_at: text("created_at").notNull(),
});
