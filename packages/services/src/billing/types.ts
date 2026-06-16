/**
 * Billing 服务类型定义。
 *
 * 关键说明（中文）
 * - pricing rule 使用 microcredits 描述单价
 * - charge 是一次已经结算的账单事实
 * - balance 桥接只暴露 billing 需要的最小扣费能力
 */

import type { Context } from "@downcity/city";

/**
 * Pricing rule 状态。
 */
export type BillingPricingRuleStatus = "active" | "disabled";

/**
 * Charge 状态。
 */
export type BillingChargeStatus = "settled" | "skipped";

/**
 * Billing 所需的 balance 最小桥接接口。
 */
export interface BillingBalanceBridge {
  /**
   * 检查余额是否足够，单位为 microcredits。
   */
  requireMicrocredits(user_id: string, amount_microcredits: number): Promise<unknown>;

  /**
   * 扣减余额，单位为 microcredits。
   */
  subMicrocredits(
    user_id: string,
    amount_microcredits: number,
    extra?: {
      /** 说明文本。 */
      note?: string;
      /** 外部引用 ID。 */
      ref?: string;
      /** 结构化扩展字段。 */
      meta?: Record<string, unknown>;
    },
  ): Promise<unknown>;
}

/**
 * Billing 服务配置。
 */
export interface BillingServiceOptions {
  /**
   * 已挂载到 City 的 balance 服务实例。
   */
  balance: BillingBalanceBridge;

  /**
   * 默认 pricing rules。
   */
  pricing_rules?: BillingPricingRuleInput[];

  /**
   * 是否启用请求前余额检查。
   */
  require_before_call?: boolean;
}

/**
 * 外部服务显式提交的扣费输入。
 */
export interface BillingChargeInput {
  /**
   * 当前 service action context。
   */
  ctx: Context;

  /**
   * 扣费金额，单位为 microcredits。
   */
  amount_microcredits: number;

  /**
   * 账单说明。
   */
  note?: string;

  /**
   * 扩展审计信息。
   */
  metadata?: Record<string, unknown>;
}

/**
 * Pricing rule 输入。
 */
export interface BillingPricingRuleInput extends Record<string, unknown> {
  /**
   * 规则 ID。
   */
  rule_id?: string;

  /**
   * 服务 ID，例如 ai。
   */
  service_id?: string;

  /**
   * action ID，例如 chat/completions。
   */
  action_id?: string;

  /**
   * 模型 ID，空表示 fallback。
   */
  model_id?: string;

  /**
   * provider ID，空表示 fallback。
   */
  provider_id?: string;

  /**
   * 每次请求固定扣费，单位为 microcredits。
   */
  request_microcredits?: number;

  /**
   * 每个 input token 扣费，单位为 microcredits。
   */
  input_token_microcredits?: number;

  /**
   * 每 1,000,000 个 input token 扣费，单位为 microcredits。
   */
  input_mtoken_microcredits?: number;

  /**
   * 每个 output token 扣费，单位为 microcredits。
   */
  output_token_microcredits?: number;

  /**
   * 每 1,000,000 个 output token 扣费，单位为 microcredits。
   */
  output_mtoken_microcredits?: number;

  /**
   * 每个 cached input token 扣费，单位为 microcredits。
   */
  cached_token_microcredits?: number;

  /**
   * 每 1,000,000 个 cached input token 扣费，单位为 microcredits。
   */
  cached_mtoken_microcredits?: number;

  /**
   * 每张图片扣费，单位为 microcredits。
   */
  image_microcredits?: number;

  /**
   * 规则状态。
   */
  status?: BillingPricingRuleStatus;

  /**
   * 说明文本。
   */
  note?: string;
}

/**
 * Pricing rule 记录。
 */
export interface BillingPricingRule extends Required<BillingPricingRuleInput>, Record<string, unknown> {
  /**
   * 规则 ID。
   */
  rule_id: string;

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
 * Charge 记录。
 */
export interface BillingCharge extends Record<string, unknown> {
  /** 扣费记录 ID。 */
  charge_id: string;
  /** 用户 ID。 */
  user_id: string;
  /** Town ID。 */
  town_id: string;
  /** 服务 ID。 */
  service_id: string;
  /** action ID。 */
  action_id: string;
  /** 模型 ID。 */
  model_id: string;
  /** provider ID。 */
  provider_id: string;
  /** 命中的 pricing rule ID。 */
  rule_id: string;
  /** 扣费金额，单位为 credits。 */
  amount: number;
  /** 扣费金额，单位为 microcredits。 */
  amount_microcredits: number;
  /** 状态。 */
  status: BillingChargeStatus;
  /** 说明文本。 */
  note: string;
  /** 扩展字段 JSON。 */
  metadata_json: string;
  /** 创建时间。 */
  created_at: string;
}

/**
 * Charge 查询条件。
 */
export interface BillingChargeQuery extends Record<string, unknown> {
  /** 可选用户 ID。 */
  user_id?: string;
  /** 可选 Town ID。 */
  town_id?: string;
  /** 返回条数上限。 */
  limit?: string | number;
}

/**
 * Pricing rule 查询条件。
 */
export interface BillingPricingRuleQuery extends Record<string, unknown> {
  /** 返回条数上限。 */
  limit?: string | number;
}

/**
 * Billing hook 结算上下文。
 */
export interface BillingSettlementContext {
  /**
   * 当前 service action context。
   */
  ctx: Context;

  /**
   * 命中的 pricing rule。
   */
  rule: BillingPricingRule;

  /**
   * 结算金额，单位为 microcredits。
   */
  amount_microcredits: number;
}
