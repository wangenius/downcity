/**
 * @downcity/type 公共协议入口。
 *
 * 关键点（中文）
 * - 这里只放跨 package 必须共享的协议类型。
 * - 不放 Agent SDK 自己的组合类型，也不放 City SDK 的具体实现类。
 * - 运行时可执行能力通过隐藏 symbol 暴露，避免污染用户可见的模型目录字段。
 */

import type { UIMessage, UIMessageChunk } from "ai";

/**
 * City model 的公开协议标识。
 */
export const CITY_MODEL_KIND = "downcity.city-model" as const;

/**
 * City model 的隐藏调用器 symbol。
 *
 * 关键点（中文）
 * - 使用全局 symbol，保证不同 package 副本之间仍可识别同一个协议键。
 * - 该字段不面向用户直接调用，只供支持 CityModel 的 SDK 内部适配。
 */
export const CITY_MODEL_INVOKER: unique symbol = Symbol.for(
  "downcity.city-model.invoker",
) as never;

/**
 * City 模型依赖的环境变量需求。
 */
export interface CityModelEnvRequirement {
  /**
   * 环境变量 key，例如 `OPENAI_API_KEY`。
   */
  key: string;

  /**
   * 给管理员展示的说明文本。
   */
  description: string;

  /**
   * 当前环境变量是否为调用该模型的必填项。
   */
  required: boolean;
}

/**
 * City 模型目录中的公开模型信息。
 */
export interface CityModelDescriptor {
  /**
   * 模型唯一 ID，用于请求 City AIService。
   */
  id: string;

  /**
   * 模型展示名称，用于 Console、文档或产品 UI。
   */
  name: string;

  /**
   * 模型说明文本。
   */
  description: string;

  /**
   * 该模型支持的能力列表，例如 `text`、`stream`、`image`。
   */
  modalities: string[];

  /**
   * 用于筛选或展示的模型标签。
   */
  tags: string[];

  /**
   * 模型元数据，供宿主记录 provider、区域、套餐等扩展信息。
   */
  meta: Record<string, unknown>;

  /**
   * 模型依赖的环境变量需求。
   *
   * 关键点（中文）
   * - 通常只在 admin 身份下返回。
   * - user 身份下可能不存在该字段。
   */
  env_requirements?: CityModelEnvRequirement[];

  /**
   * 该模型默认负责的 modality 列表。
   *
   * 关键点（中文）
   * - 通常只在 admin 身份下返回。
   * - user 身份下默认能力由 ModelCatalog 计算得到。
   */
  default_modes?: string[];

  /**
   * 当前模型是否为目录中的全局默认模型。
   *
   * 关键点（中文）
   * - 该字段通常由 City 侧 ModelCatalog 计算得到。
   */
  is_default?: boolean;

  /**
   * 当前模型作为默认模型负责的 modality 列表。
   *
   * 关键点（中文）
   * - 该字段通常由 City 侧 ModelCatalog 计算得到。
   */
  default_modalities?: string[];
}

/**
 * City 模型执行输入。
 */
export interface CityModelInvokeInput {
  /**
   * 单轮 prompt 文本。
   */
  prompt?: string;

  /**
   * 多轮 UIMessage 消息列表。
   */
  messages?: UIMessage[];

  /**
   * 模型可调用工具定义。
   */
  tools?: unknown;

  /**
   * provider 级扩展选项。
   */
  providerOptions?: unknown;

  /**
   * 其他透传给 City AIService action 的输入字段。
   */
  [key: string]: unknown;
}

/**
 * City 模型隐藏调用器。
 */
export interface CityModelInvoker {
  /**
   * 使用当前 City 模型执行一次非流式文本调用。
   */
  text(input: CityModelInvokeInput): Promise<UIMessage>;

  /**
   * 使用当前 City 模型执行一次流式调用。
   */
  stream(input: CityModelInvokeInput): Promise<ReadableStream<UIMessageChunk>>;
}

/**
 * 可执行 City 模型。
 *
 * 关键点（中文）
 * - 公开字段来自 City 模型目录。
 * - 隐藏调用器由 City 注入，Agent SDK 可据此把 CityModel 适配为 LanguageModel。
 */
export interface CityModel extends CityModelDescriptor {
  /**
   * City model 协议标识。
   */
  readonly kind: typeof CITY_MODEL_KIND;

  /**
   * 隐藏调用器，不作为用户日常 API 使用。
   */
  readonly [CITY_MODEL_INVOKER]: CityModelInvoker;
}

/**
 * 判断输入值是否实现 CityModel 协议。
 */
export function isCityModel(value: unknown): value is CityModel {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<PropertyKey, unknown>;
  return (
    record.kind === CITY_MODEL_KIND &&
    typeof record.id === "string" &&
    typeof record[CITY_MODEL_INVOKER] === "object" &&
    record[CITY_MODEL_INVOKER] !== null
  );
}

