/**
 * AI Service 类型模块。
 *
 * 包含模型配置、action 映射、运行时模型和执行上下文类型。
 */

import type { ActionFn } from "../action.js";
import type { AIBillingBridge } from "./billing.js";

// ===========================================================================
// 模型注册
// ===========================================================================

/**
 * 模型 action 映射，key 为通路名称。
 *
 * 两条独立通路：
 * - SDK 通路：text / stream / image / video / tts / asr — 给 User City 用
 * - OpenAI 兼容通路：openai — 给 /chat/completions 端点用
 *
 * 每个 action 接收 Context，返回对应通路的结果。
 * Provider 在构造时提供这些 action，通过 model() 方法绑定到模型配置。
 */
export interface ModelActions {
  /** 文本生成 action */
  text?: ActionFn;
  /** 流式生成 action */
  stream?: ActionFn;
  /** 图片生成 action */
  image?: ActionFn;
  /** 图片任务推进 action，用于长耗时 provider 的可恢复轮询 */
  image_job?: ActionFn;
  /** 视频生成 action */
  video?: ActionFn;
  /** 语音合成 action */
  tts?: ActionFn;
  /** 语音识别 action */
  asr?: ActionFn;
  /** OpenAI 兼容 /chat/completions action。未提供时 AIService 自动透传 */
  openai?: ActionFn;
  /** 扩展 modality action */
  [modality: string]: ActionFn | undefined;
}

/**
 * 模型配置（Provider.model() 的返回值）。
 */
export interface ModelConfig {
  /** 模型唯一 ID */
  id: string;
  /** Provider 唯一 ID */
  provider_id?: string;
  /** 模型展示名称 */
  name: string;
  /** 模型描述 */
  description?: string;
  /** 模型标签 */
  tags?: string[];
  /** 模型元数据 */
  meta?: Record<string, unknown>;
  /** 是否为默认模型 */
  default?: boolean | string[];
  /** 模型所需环境变量 */
  env?: Record<string, string>;
  /** Provider 的 baseURL（用于自动透传） */
  baseURL?: string;
  /** Provider 的环境变量 key */
  envKey?: string;
  /** 上游 API 实际模型 ID（自动透传时替换 body.model） */
  passthroughModel?: string;
  /** 各通路 action 绑定 */
  actions: ModelActions;
}

// ===========================================================================
// PublicModel — API 返回的模型信息
// ===========================================================================

export interface PublicModel {
  /** 模型 ID */
  id: string;
  /** 模型展示名称 */
  name: string;
  /** 模型描述 */
  description: string;
  /** 模型支持的 modality 列表 */
  modalities: string[];
  /** 模型标签 */
  tags: string[];
  /** 模型元数据 */
  meta: Record<string, unknown>;
  /** 模型依赖的环境变量需求（通常仅在 admin 身份下返回） */
  env_requirements?: AIModelEnvRequirement[];
  /** 模型默认负责的 modality 列表（通常仅在 admin 身份下返回） */
  default_modes?: string[];
}

/**
 * AI 模型环境变量需求。
 *
 * 用于 admin 视角展示某个模型依赖哪些运行时 key，
 * 以及这些 key 当前是否已经配置完成。
 */
export interface AIModelEnvRequirement {
  /** 环境变量 key，例如 `DEEPSEEK_API_KEY` */
  key: string;
  /** 给管理员展示的说明文本 */
  description: string;
  /** 当前是否必须提供该 key 才能调用模型 */
  required: boolean;
}

/**
 * AIService 配置。
 */
export interface AIServiceOptions {
  /**
   * AI 专用计费桥接。
   *
   * Provider 可以直接返回最终扣费金额，AIService 会通过该 bridge 完成扣费。
   */
  billing?: AIBillingBridge;
}
