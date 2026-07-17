/**
 * City Language Model Transport v1 类型模块。
 *
 * 该协议只在 City 客户端模型与 Federation AIService 之间使用。所有负载都必须
 * 可以经过 JSON 编解码，Provider 原始协议和密钥不得进入该边界。
 */

/** City Language Model Transport v1 的固定协议标识。 */
export const CITY_LANGUAGE_MODEL_PROTOCOL_V1 = "downcity-language-model-v1" as const;

/** JSON 原始值。 */
export type CityTransportJsonPrimitive = string | number | boolean | null;

/** JSON 对象。 */
export interface CityTransportJsonObject {
  /** JSON 对象字段；值只能继续使用 City transport JSON 类型。 */
  [key: string]: CityTransportJsonValue;
}

/** City transport 支持的完整 JSON 值。 */
export type CityTransportJsonValue =
  | CityTransportJsonPrimitive
  | CityTransportJsonObject
  | CityTransportJsonValue[];

/** CityModel 发给 Federation 的一次标准模型调用。 */
export interface CityLanguageModelStreamRequestV1 {
  /** 固定协议版本，用于拒绝不匹配的客户端与服务端。 */
  protocol: typeof CITY_LANGUAGE_MODEL_PROTOCOL_V1;
  /** Federation 模型目录中的模型 ID。 */
  model_id: string;
  /** JSON 编码后的 LanguageModelV3CallOptions，不包含 AbortSignal 和 HTTP headers。 */
  call: CityTransportJsonObject;
  /** 用户显式选择的 Downcity 推理强度。 */
  reasoning_effort?: string;
}

/** Federation 流中返回的可诊断错误。 */
export interface CityLanguageModelErrorV1 {
  /** 面向调用方的安全错误消息。 */
  message: string;
  /** 稳定错误类别或原始 Error name。 */
  type: string;
  /** Provider 或 Federation 返回的可选错误码。 */
  code?: string;
  /** 对应的可选 HTTP 状态码。 */
  status?: number;
  /** 调用方是否可以安全重试。 */
  retryable?: boolean;
}

/** Federation 通过 SSE 返回的单个 LanguageModelV3 流事件。 */
export interface CityLanguageModelStreamEventV1 {
  /** 固定协议版本，用于逐事件校验。 */
  protocol: typeof CITY_LANGUAGE_MODEL_PROTOCOL_V1;
  /** JSON 编码后的 LanguageModelV3StreamPart。 */
  part: CityTransportJsonObject;
}
