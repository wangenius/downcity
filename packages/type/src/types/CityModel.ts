/**
 * City 模型公共协议模块。
 *
 * 该模块定义跨 package 共享的模型目录、推理能力和隐藏调用器协议。
 * 模型目录只包含可序列化的公开信息，运行时连接能力通过全局 symbol 隐藏暴露。
 */

/** City model 的公开协议标识。 */
export const CITY_MODEL_KIND = "downcity.city-model" as const;

/**
 * City model 的隐藏调用器 symbol。
 *
 * 使用全局 symbol，保证不同 package 副本之间仍可识别同一个协议键。
 */
export const CITY_MODEL_INVOKER: unique symbol = Symbol.for(
  "downcity.city-model.invoker",
) as never;

/** City 模型依赖的环境变量需求。 */
export interface CityModelEnvRequirement {
  /** 环境变量 key，例如 `OPENAI_API_KEY`。 */
  key: string;
  /** 给管理员展示的说明文本。 */
  description: string;
  /** 当前环境变量是否为调用该模型的必填项。 */
  required: boolean;
}

/** 模型公开支持的单个推理强度档位。 */
export interface CityModelReasoningEffort {
  /** 档位唯一 ID，同时也是请求 `reasoning_effort` 使用的值。 */
  id: string;
  /** 面向用户展示的档位名称。 */
  name: string;
  /** 面向用户展示的档位说明。 */
  description?: string;
}

/** 模型公开的推理能力配置。 */
export interface CityModelReasoning {
  /** 模型支持的推理强度档位，数组顺序即前端展示顺序。 */
  efforts: CityModelReasoningEffort[];
  /** 请求未指定 `reasoning_effort` 时使用的默认档位 ID。 */
  default_effort?: string;
}

/** City 模型目录中的公开模型信息。 */
export interface CityModelDescriptor {
  /** 模型唯一 ID，用于请求 City AIService。 */
  id: string;
  /** 模型展示名称，用于 Console、文档或产品 UI。 */
  name: string;
  /** 模型说明文本。 */
  description: string;
  /** 模型支持的总上下文窗口长度，单位为 token。 */
  context_window?: number;
  /** 该模型支持的能力列表，例如 `text`、`stream`、`image`。 */
  modalities: string[];
  /** 用于筛选或展示的模型标签。 */
  tags: string[];
  /** 模型元数据，供宿主记录 provider、区域、套餐等扩展信息。 */
  meta: Record<string, unknown>;
  /** 模型公开的推理能力；未声明时表示不接受 `reasoning_effort`。 */
  reasoning?: CityModelReasoning;
  /**
   * 模型依赖的环境变量需求。
   *
   * 通常只在 admin 身份下返回，user 身份下可能不存在该字段。
   */
  env_requirements?: CityModelEnvRequirement[];
}

/** City 模型连接信息。 */
export interface CityModelConnection {
  /** OpenAI-compatible 服务端点根地址，例如 `https://example.com/v1/ai`。 */
  base_url: string;
  /** 当前 user token；Agent 会把它作为 provider apiKey 使用。 */
  api_key?: string;
  /** 当前模型的调用 ID，默认写入 OpenAI-compatible 请求体的 `model` 字段。 */
  model_id: string;
}

/** City 模型隐藏调用器。 */
export interface CityModelInvoker {
  /** 返回当前 City 模型的运行时连接信息。 */
  connection(): CityModelConnection;
}

/**
 * 可执行 City 模型。
 *
 * 公开字段来自模型目录，隐藏调用器由 City 注入并供其他 SDK 适配。
 */
export interface CityModel extends CityModelDescriptor {
  /** City model 协议标识。 */
  readonly kind: typeof CITY_MODEL_KIND;
  /** City model 隐藏调用器，不作为用户日常 API 使用。 */
  readonly [CITY_MODEL_INVOKER]: CityModelInvoker;
}

/** 判断输入值是否实现 CityModel 协议。 */
export function isCityModel(value: unknown): value is CityModel {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<PropertyKey, unknown>;
  const invoker = record[CITY_MODEL_INVOKER] as
    | { connection?: unknown }
    | undefined;
  return (
    record.kind === CITY_MODEL_KIND &&
    typeof record.id === "string" &&
    typeof invoker === "object" &&
    invoker !== null &&
    typeof invoker.connection === "function"
  );
}
