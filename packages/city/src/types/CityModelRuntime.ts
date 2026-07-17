/**
 * CityModel 客户端运行时类型模块。
 *
 * 这些类型负责把模型目录数据与已鉴权的 City HTTP 请求器组合成可执行模型，
 * 不向 Agent 暴露 Federation URL 或 user token。
 */

import type { CityModelDescriptor } from "@downcity/type";
import type { FetchResponseLike } from "../pact/http.js";
import type { CityLanguageModelStreamRequestV1 } from "./CityLanguageModelTransport.js";

/** CityModel 构造参数。 */
export interface CityModelOptions {
  /** Federation 模型目录返回的公开描述。 */
  descriptor: CityModelDescriptor;
  /** 使用 City 客户端鉴权上下文发送原生模型请求。 */
  request_stream(
    request: CityLanguageModelStreamRequestV1,
    signal?: AbortSignal,
  ): Promise<FetchResponseLike>;
}
