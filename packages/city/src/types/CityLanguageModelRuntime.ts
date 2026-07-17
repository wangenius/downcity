/**
 * Federation City LanguageModel 流运行时类型模块。
 *
 * 类型仅描述 AIService 与 transport 流编码器之间的内部边界，避免服务层直接
 * 操作未约束的 unknown 数据。
 */

import type { LanguageModel } from "ai";
import type { AIProviderOptions } from "./AIReasoning.js";
import type { CityLanguageModelStreamRequestV1 } from "./CityLanguageModelTransport.js";

/** AI SDK LanguageModelV3。 */
export type CityRuntimeLanguageModelV3 = Extract<
  LanguageModel,
  { readonly specificationVersion: "v3" }
>;

/** LanguageModelV3 的标准调用参数。 */
export type CityRuntimeCallOptions = Parameters<CityRuntimeLanguageModelV3["doStream"]>[0];

/** LanguageModelV3 的标准流结果。 */
export type CityRuntimeStreamResult = Awaited<ReturnType<CityRuntimeLanguageModelV3["doStream"]>>;

/** LanguageModelV3 的标准流事件。 */
export type CityRuntimeStreamPart =
  CityRuntimeStreamResult["stream"] extends ReadableStream<infer T> ? T : never;

/** 已校验并解码的 transport 请求。 */
export interface DecodedCityLanguageModelRequest {
  /** Federation 模型目录中的模型 ID。 */
  model_id: string;
  /** 解码后的标准 LanguageModelV3 调用参数。 */
  call: CityRuntimeCallOptions;
  /** 用户显式选择的推理强度。 */
  reasoning_effort?: string;
}

/** 创建 Federation SSE 响应所需的输入。 */
export interface CreateCityLanguageModelStreamInput {
  /** 已路由到最终 Provider 的 LanguageModelV3。 */
  model: CityRuntimeLanguageModelV3;
  /** 已解码的调用参数。 */
  call: CityRuntimeCallOptions;
  /** Federation 生成并允许传给 Provider 的选项。 */
  provider_options?: AIProviderOptions;
  /** 原始 HTTP 请求的取消信号。 */
  signal?: AbortSignal;
}

/** Federation SSE 响应及其最终完成事件。 */
export interface CityLanguageModelStreamExecution {
  /** 返回给 CityModel 客户端的 SSE Response。 */
  response: Response;
  /** 流结束后解析出的 finish 事件；异常或取消时为空。 */
  completion: Promise<CityRuntimeStreamPart | undefined>;
}

/** 供运行时校验的原始 transport 请求输入。 */
export type RawCityLanguageModelRequest = CityLanguageModelStreamRequestV1 | Record<string, unknown>;
