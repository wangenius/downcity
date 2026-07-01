/**
 * @downcity/type 公共协议入口。
 *
 * 关键点（中文）
 * - 这里只放跨 package 必须共享的协议类型。
 * - 不放 Agent SDK 自己的组合类型，也不放 City SDK 的具体实现类。
 * - 运行时可执行能力通过隐藏 symbol 暴露，避免污染用户可见的模型目录字段。
 */

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

}

/**
 * City 模型连接信息。
 *
 * 关键点（中文）
 * - 该结构只给 SDK 内部消费，不作为模型目录的公开展示字段。
 * - Agent SDK 会基于这些信息自行创建 AI SDK LanguageModel。
 */
export interface CityModelConnection {
  /**
   * OpenAI-compatible 服务端点根地址，例如 `https://example.com/v1/ai`。
   */
  base_url: string;

  /**
   * 当前 user token；Agent 会把它作为 provider apiKey 使用。
   */
  api_key?: string;

  /**
   * 当前模型的调用 ID，默认写入 OpenAI-compatible 请求体的 `model` 字段。
   */
  model_id: string;

  /**
   * 每次请求都需要额外合并到请求体的 City 上下文字段，例如 `city_id`。
   */
  request_body: Record<string, unknown>;
}

/**
 * City 模型隐藏调用器。
 */
export interface CityModelInvoker {
  /**
   * 返回当前 City 模型的运行时连接信息。
   *
   * 关键点（中文）
   * - CityModel 公开字段仍然是模型目录信息。
   * - Agent SDK 负责把连接信息转换为 AI SDK LanguageModel。
   */
  connection(): CityModelConnection;
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

/**
 * Federation RPC 请求方法。
 *
 * 关键点（中文）
 * - `federation.request` 表示把一次 HTTP 形态的 Federation 请求封装进本机 RPC。
 * - RPC transport 只负责传输，不重新发明 service/action 协议。
 */
export type FederationRpcMethod = "federation.request";

/**
 * Federation RPC 可信访问级别。
 *
 * 关键点（中文）
 * - RPC transport 只负责传输，不重新发明 service/action 协议。
 * - 仅 Admin City 可以声明本机可信管理访问，避免携带 admin_secret_key。
 * - User City 不通过 RPC 协议注入身份，仍然使用 guest / user_token 模型。
 */
export type FederationRpcTrustedAccess = "admin";

/**
 * Federation RPC 请求参数。
 */
export interface FederationRpcRequestParams {
  /** HTTP 方法，例如 `GET` 或 `POST`。 */
  method: string;
  /** Federation 内部请求路径，必须以 `/` 开头，可包含 querystring。 */
  path: string;
  /** 请求头。 */
  headers?: Record<string, string>;
  /** 请求 body，按 UTF-8 文本传输。 */
  body?: string;
  /**
   * 本机可信访问级别。
   *
   * 只有 Admin City 会传 `admin`；普通用户请求不传该字段。
   */
  trusted_access?: FederationRpcTrustedAccess;
}

/**
 * Federation RPC 请求。
 */
export interface FederationRpcRequest {
  /** 请求 id，用于匹配响应。 */
  id: string;
  /** RPC 方法名。 */
  method: FederationRpcMethod;
  /** 请求参数。 */
  params: FederationRpcRequestParams;
}

/**
 * Federation RPC 响应数据。
 */
export interface FederationRpcResponseData {
  /** HTTP 状态码。 */
  status: number;
  /** 响应头。 */
  headers: Record<string, string>;
  /** 响应 body，按 UTF-8 文本传输。 */
  body: string;
}

/**
 * Federation RPC 成功响应帧。
 */
export interface FederationRpcSuccessFrame {
  /** 响应对应的请求 id。 */
  id: string;
  /** 请求是否成功进入 Federation 并得到响应。 */
  success: true;
  /** Federation 响应数据。 */
  data: FederationRpcResponseData;
}

/**
 * Federation RPC 失败响应帧。
 */
export interface FederationRpcErrorFrame {
  /** 响应对应的请求 id。 */
  id: string;
  /** 请求是否成功。 */
  success: false;
  /** 错误信息。 */
  error: string;
}

/**
 * Federation RPC 响应帧。
 */
export type FederationRpcResponseFrame =
  | FederationRpcSuccessFrame
  | FederationRpcErrorFrame;
