/**
 * AI 推理强度运行时类型。
 *
 * 这里的结构只表示 AIService 已完成模型校验后的可信结果，不能直接由请求体构造。
 */

/** 已解析的模型推理强度。 */
export interface AIResolvedReasoning {
  /** 最终模型接受的推理强度档位 ID。 */
  effort: string;
  /** 档位来自调用方请求还是模型默认配置。 */
  source: "request" | "default";
}

/** AI SDK provider option 支持的 JSON 值。 */
export type AIProviderOptionValue =
  | null
  | string
  | number
  | boolean
  | AIProviderOptionObject
  | AIProviderOptionValue[];

/** 单个 AI SDK Provider 的 JSON 参数对象。 */
export interface AIProviderOptionObject {
  /** Provider 私有参数值。 */
  [key: string]: AIProviderOptionValue | undefined;
}

/** 按 AI SDK Provider ID 分组的 providerOptions。 */
export interface AIProviderOptions {
  /** 指定 Provider 的私有参数对象。 */
  [provider_id: string]: AIProviderOptionObject;
}
