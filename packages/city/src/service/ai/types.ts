/**
 * AI Service 类型模块。
 *
 * 包含模型配置、action 映射、运行时模型和执行上下文类型。
 */

import type { ActionFn } from "../action.js";
import type { AIBalanceBridge, AIProviderBillFn } from "./charge.js";
import type {
  CityModelDescriptor,
  CityModelEnvRequirement,
  CityModelReasoning,
} from "@downcity/type";
import type { LanguageModel } from "ai";

// ===========================================================================
// 模型注册
// ===========================================================================

/**
 * Provider 构造选项。
 */
export interface ProviderOptions {
  /** Provider 唯一 ID。 */
  id: string;
  /** 模型所需环境变量说明。 */
  env?: Record<string, string>;
  /** Provider 的 baseURL（用于自动透传）。 */
  baseURL?: string;
  /** Provider 的环境变量 key。 */
  envKey?: string;
  /** 上游 API 实际模型 ID（自动透传时替换 body.model）。 */
  passthroughModel?: string;
}

/**
 * OpenAI-compatible client 工厂入参。
 */
export interface OpenAICompatibleClientConfig {
  /** 上游 API Key。 */
  apiKey: string;
  /** 上游 OpenAI-compatible baseURL。 */
  baseURL: string;
  /** Provider 展示名称，通常用于底层 SDK 调试和埋点。 */
  name: string;
}

/**
 * OpenAI-compatible chat client 最小能力约束。
 */
export interface OpenAICompatibleClient {
  /** 根据模型 ID 创建可传给 AI SDK 的 chat model。 */
  chat(modelId: string): CityLanguageModelV3;
}

/** 当前 City runtime 支持的 AI SDK LanguageModelV3。 */
export type CityLanguageModelV3 = Extract<
  LanguageModel,
  { readonly specificationVersion: "v3" }
>;

/** Provider 为原生 City endpoint 暴露的模型运行时。 */
export interface ModelLanguageRuntime {
  /** 根据最终路由 Context 创建实际 Provider LanguageModelV3。 */
  create_language_model(ctx: import("../service.js").Context): CityLanguageModelV3;
  /** 将 Federation 已校验的配置转换成当前 Provider options。 */
  build_provider_options?(
    ctx: import("../service.js").Context,
    model: CityLanguageModelV3,
  ): import("../../types/AIReasoning.js").AIProviderOptions | undefined;
}


/**
 * 模型 action 映射，key 为通路名称。
 *
 * 两条独立通路：
 * - SDK action 通路：text / video / tts / asr — 给 User City 用
 * - 模型流通路：由 ModelLanguageRuntime 直接提供，不进入 actions
 * - 图片任务通路：image_create / image_fetch / image_result — 给图片任务创建、后台抓取和用户查询调用
 * - OpenAI 兼容通路：openai — 给 /chat/completions 端点用
 *
 * 每个 action 接收 Context，返回对应通路的结果。
 * Provider 通过方法声明提供 action，通过 model() 方法绑定到模型配置。
 */
export interface ModelActions {
  /** 文本生成 action */
  text?: ActionFn;
  /** 图片任务创建 action，负责启动 provider 图片生成任务。 */
  image_create?: ActionFn;
  /** 图片任务抓取 action，负责查询上游状态并返回 provider 图片生成结果。 */
  image_fetch?: ActionFn;
  /** 图片任务查询 action，通常由 AIService 自己实现为读取 async_jobs。 */
  image_result?: ActionFn;
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
 * 模型级 fallback 媒体输入。
 *
 * AIService 只负责从请求中提取 file 媒体信息，具体是否命中 fallback 由模型配置自行判断。
 */
export interface ModelFallbackMedia {
  /** file part 的 IANA 媒体类型，例如 `image/png`、`audio/mpeg` 或 `application/pdf`。 */
  media_type: string;
  /** file part 的文件名；请求未提供文件名时为空。 */
  filename?: string;
  /** file part 的 URL 或 Data URL；请求未提供 URL 时为空。 */
  url?: string;
}

/**
 * 模型级 fallback 规则。
 *
 * 规则按数组顺序执行，第一条匹配且目标模型可用的规则会成为实际执行模型。
 */
export interface ModelFallbackRule {
  /** 判断当前媒体输入是否应该使用这条 fallback 规则。 */
  match: (media: ModelFallbackMedia) => boolean;
  /** 规则命中后切换到的目标模型。 */
  model: ModelConfig | string;
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
  /** 模型支持的总上下文窗口长度，单位为 token。 */
  context_window?: number;
  /** 模型标签 */
  tags?: string[];
  /** 模型元数据 */
  meta?: Record<string, unknown>;
  /** 模型支持的推理强度配置。 */
  reasoning?: CityModelReasoning;
  /** 模型所需环境变量 */
  env?: Record<string, string>;
  /** Provider 的 baseURL（用于自动透传） */
  baseURL?: string;
  /** Provider 的环境变量 key */
  envKey?: string;
  /** 上游 API 实际模型 ID（自动透传时替换 body.model） */
  passthroughModel?: string;
  /** 模型级 fallback 规则列表，按顺序匹配请求中的 file 媒体输入。 */
  fallback?: ModelFallbackRule[];
  /** 各通路 action 绑定 */
  actions: ModelActions;
  /** CityModel `/v1/ai/stream` 使用的 Provider runtime。 */
  language_model?: ModelLanguageRuntime;
  /** 本模型的出账方法，只生成扣费草稿，不直接扣余额。 */
  bill?: AIProviderBillFn;
}

// ===========================================================================
// PublicModel — API 返回的模型信息
// ===========================================================================

export type PublicModel = CityModelDescriptor;

/**
 * AI 模型环境变量需求。
 *
 * 用于 admin 视角展示某个模型依赖哪些运行时 key，
 * 以及这些 key 当前是否已经配置完成。
 */
export type AIModelEnvRequirement = CityModelEnvRequirement;

/**
 * AIService 配置。
 */
export interface AIServiceOptions {
  /**
   * AI 专用余额桥接。
   *
   * Provider 可以直接返回最终扣费金额，AIService 会通过该 bridge 完成扣费。
   */
  balance?: AIBalanceBridge;
  /**
   * 图片异步任务允许保持 queued/running 的最长时间，单位毫秒。
   *
   * 超过该时间后，AIService 会把任务标记为 failed，并写入 upstream timeout。
   * 设为 0 或负数会回退到默认值。
   */
  image_max_pending_duration_ms?: number;
}
