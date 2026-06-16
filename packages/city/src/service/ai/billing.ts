/**
 * AI Provider 计费协议。
 *
 * 关键说明（中文）
 * - Provider 自己理解上游 usage 与价格规则，并返回最终应扣金额。
 * - AIService 只负责在正确的生命周期内提交扣费，不理解 token/cache 等 provider 细节。
 * - Billing bridge 由外部服务注入，避免 @downcity/city 反向依赖 @downcity/services。
 */

import type { Context } from "../service.js";

/**
 * Provider 计算出的单次扣费结果。
 */
export interface AIProviderBillingLine {
  /** 扣费金额，单位为 microcredits。 */
  amount_microcredits: number;
  /** 账单说明。 */
  note?: string;
  /** 内部审计信息，不作为跨 provider 的公共 usage 协议。 */
  metadata?: Record<string, unknown>;
}

/**
 * AIService 提交给外部 Billing bridge 的扣费输入。
 */
export interface AIBillingChargeInput extends AIProviderBillingLine {
  /** 当前 service action context。 */
  ctx: Context;
}

/**
 * AIService 依赖的最小 Billing bridge。
 */
export interface AIBillingBridge {
  /** 执行扣费并记录账单。 */
  charge(input: AIBillingChargeInput): Promise<unknown>;
}

/**
 * Provider action 可返回的带账单普通输出。
 */
export interface AIProviderBilledOutput<T = unknown> {
  /** 对外返回的原始 action 输出。 */
  output: T;
  /** Provider 已计算好的扣费结果。 */
  billing?: AIProviderBillingLine | Promise<AIProviderBillingLine | undefined> | undefined;
}

/**
 * Provider action 可返回的带账单 Response 输出。
 */
export interface AIProviderBilledResponse {
  /** 对外返回的 HTTP Response。 */
  response: Response;
  /** Provider 已计算好的扣费结果。 */
  billing?: AIProviderBillingLine | Promise<AIProviderBillingLine | undefined> | undefined;
}

