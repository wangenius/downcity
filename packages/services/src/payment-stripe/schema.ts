/**
 * Stripe 一次性充值服务数据库 schema。
 *
 * 关键说明（中文）
 * - 本服务只管理 Stripe 支付侧事实，不直接维护余额账本
 * - 真正的钱包账户、充值单与流水仍然由 balance 服务负责
 * - 这里的表只负责记录 Stripe 支付映射与 webhook 事件
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Stripe 支付记录表。
 *
 * 关键说明（中文）
 * - 一条记录对应一次 topup 的 Stripe 支付尝试
 * - `topup_id` 连接 balance 服务里的充值单
 * - `checkout_url` 允许前端重试取回已创建的 Checkout 链接
 */
export const stripePayments = sqliteTable("service_stripe_payments", {
  payment_id: text("payment_id").primaryKey(),
  topup_id: text("topup_id").notNull(),
  user_id: text("user_id").notNull(),
  stripe_checkout_session_id: text("stripe_checkout_session_id").notNull(),
  stripe_payment_intent_id: text("stripe_payment_intent_id").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  checkout_url: text("checkout_url").notNull(),
  metadata_json: text("metadata_json").notNull(),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
});

/**
 * Stripe webhook 事件表。
 *
 * 关键说明（中文）
 * - `event_id` 作为 webhook 幂等键
 * - `sync_status` 用于区分已应用、忽略和失败的事件
 */
export const stripeEvents = sqliteTable("service_stripe_events", {
  event_id: text("event_id").primaryKey(),
  type: text("type").notNull(),
  payload_json: text("payload_json").notNull(),
  sync_status: text("sync_status").notNull(),
  sync_error: text("sync_error").notNull(),
  created_at: text("created_at").notNull(),
});
