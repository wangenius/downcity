/**
 * Client 包 HTTP 基础设施。
 *
 * 集中处理 fetch 封装、URL 规范化、服务路径等共享工具。
 * 同时包含 HTTP 层的公共类型。
 */

// ===========================================================================
// 公共类型
// ===========================================================================

/** fetch 层收到的原始字节流 body */
export type RawStreamBody = ReadableStream<Uint8Array> | null;

/** SDK 内部传给 fetch 的请求配置 */
export interface RequestInitLike {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** fetch 返回对象的最小接口 */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  body: RawStreamBody;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** SDK 使用的 fetch 函数签名 */
export interface FetchLike {
  (url: string, init: RequestInitLike): Promise<FetchResponseLike>;
}

// ===========================================================================
// URL 与校验
// ===========================================================================

/** 去掉 server URL 末尾多余斜杠 */
export function normalizeBaseURL(value: unknown, label: string): string {
  const url = requiredString(value, label);
  return url.replace(/\/+$/, "");
}

/** 校验必填字符串 */
export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

// ===========================================================================
// fetch 封装
// ===========================================================================

/** 读取全局 fetch */
export function defaultFetch(): FetchLike {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("fetch is required");
  }
  return async (url, init) => globalThis.fetch(url, init as RequestInit) as Promise<FetchResponseLike>;
}

/** 发送 JSON 请求并解析响应 */
export async function requestJSON<T>(params: {
  fetch: FetchLike;
  url: string;
  init: RequestInitLike;
}): Promise<T> {
  const response = await params.fetch(params.url, params.init);
  if (!response.ok) throw await httpError(response);
  return response.json() as Promise<T>;
}

/** 发送请求并返回原始响应 */
export async function requestRaw(params: {
  fetch: FetchLike;
  url: string;
  init: RequestInitLike;
}): Promise<FetchResponseLike> {
  const response = await params.fetch(params.url, params.init);
  if (!response.ok) throw await httpError(response);
  return response;
}

/** 发送请求并解析文本响应 */
export async function requestText(params: {
  fetch: FetchLike;
  url: string;
  init: RequestInitLike;
}): Promise<string> {
  const response = await params.fetch(params.url, params.init);
  if (!response.ok) throw await httpError(response);
  return response.text();
}

// ===========================================================================
// 服务路径工具
// ===========================================================================

/** 标准化服务 ID */
export function normalizeServiceId(value: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError("service id is required");
  return normalized;
}

/** 拼接服务请求路径 */
export function servicePath(prefix: string, serviceId: string, path: string): string {
  const suffix = String(path ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return suffix ? `${prefix}/${serviceId}/${suffix}` : `${prefix}/${serviceId}`;
}

// ===========================================================================
// 内部
// ===========================================================================

async function httpError(response: FetchResponseLike): Promise<Error> {
  const body = await response.text();
  const error = new Error(`Downcity request failed with ${response.status}: ${body}`) as Error & {
    status?: number;
    body?: string;
  };
  error.status = response.status;
  error.body = body;
  return error;
}
