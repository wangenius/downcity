/**
 * Billing 服务表结构定义。
 *
 * 关键说明（中文）
 * - pricing_rules 负责把 usage 事实转换成 microcredits
 * - charges 记录每次已经结算的扣费结果
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const PRICING_RULE_TABLE = "service_billing_pricing_rules";
export const CHARGE_TABLE = "service_billing_charges";

/**
 * SQLite pricing rule 表。
 */
export const billingPricingRules = sqliteTable(PRICING_RULE_TABLE, {
  /** 规则 ID。 */
  rule_id: text("rule_id").primaryKey(),
  /** 服务 ID，例如 ai。 */
  service_id: text("service_id").notNull(),
  /** action ID，例如 chat/completions。 */
  action_id: text("action_id").notNull(),
  /** 模型 ID，空字符串表示 fallback。 */
  model_id: text("model_id").notNull(),
  /** provider ID，空字符串表示 fallback。 */
  provider_id: text("provider_id").notNull(),
  /** 每次请求固定扣费。 */
  request_microcredits: integer("request_microcredits").notNull(),
  /** 每个 input token 扣费。 */
  input_token_microcredits: integer("input_token_microcredits").notNull(),
  /** 每 1,000,000 个 input token 扣费。 */
  input_mtoken_microcredits: integer("input_mtoken_microcredits").notNull(),
  /** 每个 output token 扣费。 */
  output_token_microcredits: integer("output_token_microcredits").notNull(),
  /** 每 1,000,000 个 output token 扣费。 */
  output_mtoken_microcredits: integer("output_mtoken_microcredits").notNull(),
  /** 每个 cached input token 扣费。 */
  cached_token_microcredits: integer("cached_token_microcredits").notNull(),
  /** 每 1,000,000 个 cached input token 扣费。 */
  cached_mtoken_microcredits: integer("cached_mtoken_microcredits").notNull(),
  /** 每张图片扣费。 */
  image_microcredits: integer("image_microcredits").notNull(),
  /** 规则状态。 */
  status: text("status").notNull(),
  /** 说明文本。 */
  note: text("note").notNull(),
  /** 创建时间。 */
  created_at: text("created_at").notNull(),
  /** 更新时间。 */
  updated_at: text("updated_at").notNull(),
});

/**
 * SQLite charge 表。
 */
export const billingCharges = sqliteTable(CHARGE_TABLE, {
  /** 扣费记录 ID。 */
  charge_id: text("charge_id").primaryKey(),
  /** 用户 ID。 */
  user_id: text("user_id").notNull(),
  /** Town ID。 */
  town_id: text("town_id").notNull(),
  /** 服务 ID。 */
  service_id: text("service_id").notNull(),
  /** action ID。 */
  action_id: text("action_id").notNull(),
  /** 模型 ID。 */
  model_id: text("model_id").notNull(),
  /** provider ID。 */
  provider_id: text("provider_id").notNull(),
  /** 命中的 pricing rule ID。 */
  rule_id: text("rule_id").notNull(),
  /** 扣费金额，单位为 microcredits。 */
  amount_microcredits: integer("amount_microcredits").notNull(),
  /** 状态。 */
  status: text("status").notNull(),
  /** 说明文本。 */
  note: text("note").notNull(),
  /** 扩展字段 JSON。 */
  metadata_json: text("metadata_json").notNull(),
  /** 创建时间。 */
  created_at: text("created_at").notNull(),
});
