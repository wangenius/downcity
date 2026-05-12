/**
 * LLM 请求/响应日志格式化公共入口。
 *
 * 关键点（中文）
 * - 外部模块只从这里导入，内部拆分对调用方透明。
 * - `ProviderFetch` 仍然保留在 facade，避免影响 `Fetch.ts` 的类型入口。
 */

export { parseFetchRequestForLog } from "./FormatRequest.js";
export { parseFetchResponseForLog } from "./FormatResponse.js";

export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
