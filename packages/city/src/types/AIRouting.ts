/**
 * AI 模型运行时路由类型。
 *
 * 用于描述模型 action 解析结果、媒体 fallback 计划以及路由模块所需的模型访问能力。
 */

import type { ActionFn } from "../service/action.js";
import type { ModelConfig } from "../service/ai/types.js";

/** 已解析的模型 action。 */
export interface AIResolvedAction {
  /** 本次 action 绑定的最终模型配置。 */
  model?: ModelConfig;
  /** 本次请求实际执行的 Provider action。 */
  action: ActionFn;
}

/** 模型发生 fallback 的标准原因。 */
export type AIRoutingFallbackReason = "input_requires_media";

/** 最终模型路由计划。 */
export interface AIResolvedRoutingPlan {
  /** 最终执行的模型和 action。 */
  resolved: AIResolvedAction;
  /** 发生 fallback 时的原模型 ID。 */
  fallback_from?: string;
  /** 发生 fallback 时的标准原因。 */
  fallback_reason?: AIRoutingFallbackReason;
  /** 触发 fallback 的媒体类型。 */
  fallback_media_type?: string;
}

/** 媒体 fallback 路由访问模型注册表所需的最小能力。 */
export interface AIModelRoutingAdapter {
  /** 解析 fallback 规则中的模型 ID 或内联模型配置。 */
  resolve_model(input: ModelConfig | string): ModelConfig | undefined;
  /** 解析目标模型在指定通路下的 action。 */
  resolve_action(model: ModelConfig, mode: string): ActionFn | undefined;
  /** 判断目标模型当前是否满足环境变量等运行条件。 */
  is_available(model: ModelConfig): boolean;
}
