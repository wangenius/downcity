/**
 * AI Provider 扣费协议。
 *
 * 关键说明（中文）
 * - Provider 自己理解上游 usage 与价格规则，并返回最终应扣金额。
 * - AIService 只负责在正确的生命周期内提交扣费，不理解 token/cache 等 provider 细节。
 * - Balance bridge 只暴露通用 charge 能力，避免 @downcity/city 反向依赖 @downcity/services。
 */

import type { Context } from "../service.js";

/**
 * Provider 计算出的单次扣费结果。
 */
export interface AIProviderChargeLine {
  /**
   * 可选扣费用户 ID。
   *
   * 后台任务（例如 image_persist）通常由 admin / queue 触发，没有当前 user。
   * 这时 bill() 应从已保存任务归属中返回 user_id，AIService 会优先使用它。
   */
  user_id?: string;
  /** 扣费金额，单位为 microcredits。 */
  amount_microcredits: number;
  /** 账单说明。 */
  note?: string;
  /** 外部引用 ID。 */
  ref?: string;
  /** 内部审计信息，不作为跨 provider 的公共 usage 协议。 */
  metadata?: Record<string, unknown>;
}

/**
 * AIService 提交给外部 Balance bridge 的扣费输入。
 */
export interface AIBalanceChargeInput extends AIProviderChargeLine {
  /** 当前用户 ID。 */
  user_id: string;
}

/**
 * AIService 依赖的最小 Balance bridge。
 */
export interface AIBalanceBridge {
  /** 执行扣费并记录账单。 */
  charge(input: AIBalanceChargeInput): Promise<unknown>;
}

/**
 * Provider 或模型生成扣费行的方法。
 */
export type AIProviderBillFn = (
  ctx: Context,
  output: unknown,
) => AIProviderChargeLine | Promise<AIProviderChargeLine | undefined> | undefined;

/**
 * Provider action 可返回的带扣费普通输出。
 */
export interface AIProviderChargedOutput<T = unknown> {
  /** 对外返回的原始 action 输出。 */
  output: T;
  /** Provider 已计算好的扣费结果。 */
  charge?: AIProviderChargeLine | Promise<AIProviderChargeLine | undefined> | undefined;
}

/**
 * Provider action 可返回的带扣费 Response 输出。
 */
export interface AIProviderChargedResponse {
  /** 对外返回的 HTTP Response。 */
  response: Response;
  /** Provider 已计算好的扣费结果。 */
  charge?: AIProviderChargeLine | Promise<AIProviderChargeLine | undefined> | undefined;
}
