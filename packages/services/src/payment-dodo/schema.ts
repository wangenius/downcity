/**
 * Dodo Payments 一次性充值服务数据库 schema。
 *
 * 关键说明（中文）
 * - 本服务只记录 Dodo 支付侧事实
 * - 真正的钱包账户、充值单与流水仍由 balance 服务负责
 * - webhook 事件表用于幂等处理和同步状态审计
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Dodo 支付记录表。
 *
 * 关键说明（中文）
 * - 一条记录对应一次 topup 的 Dodo Checkout Session
 * - `topup_id` 连接 balance 服务里的充值单
 * - `checkout_url` 允许前端重试取回已创建的 Checkout 链接
 */
export const dodoPayments = sqliteTable("service_dodo_payments", {
  payment_id: text("payment_id").primaryKey(),
  topup_id: text("topup_id").notNull(),
  user_id: text("user_id").notNull(),
  dodo_checkout_session_id: text("dodo_checkout_session_id").notNull(),
  dodo_payment_id: text("dodo_payment_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  checkout_url: text("checkout_url").notNull(),
  metadata_json: text("metadata_json").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

/**
 * Dodo webhook 事件表。
 *
 * 关键说明（中文）
 * - `event_id` 作为 webhook 幂等键
 * - `sync_status` 用于区分已应用、忽略和失败的事件
 */
export const dodoEvents = sqliteTable("service_dodo_events", {
  event_id: text("event_id").primaryKey(),
  type: text("type").notNull(),
  payload_json: text("payload_json").notNull(),
  sync_status: text("sync_status").notNull(),
  sync_error: text("sync_error").notNull(),
  created_at: text("created_at").notNull(),
});
