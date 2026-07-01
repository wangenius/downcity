/**
 * City Pact 请求抽象。
 *
 * 关键点（中文）
 * - 上层 Admin/User invoker 只依赖 requester，不关心底层是 HTTP 还是本机 RPC。
 * - HTTP 仍然使用 bearer token；RPC 通过本机可信身份进入 Federation。
 */

import type {
  FederationRpcIdentity,
  FederationRpcResponseData,
} from "@downcity/type";
import {
  defaultFetch,
  normalizeBaseURL,
  requestJSON,
  requestRaw,
  requestText,
  type FetchLike,
  type FetchResponseLike,
  type RequestInitLike,
} from "./http.js";
import { request_federation_rpc } from "./rpc-client.js";

/**
 * City 请求器。
 */
export interface CityRequester {
  /** 请求入口根地址。 */
  readonly base_url: string;
  /** 请求 JSON 并解析。 */
  json<T>(path: string, init: RequestInitLike): Promise<T>;
  /** 请求文本。 */
  text(path: string, init: RequestInitLike): Promise<string>;
  /** 请求原始响应。 */
  raw(path: string, init: RequestInitLike): Promise<FetchResponseLike>;
}

/**
 * 创建 HTTP 请求器。
 */
export function create_http_requester(options: {
  /** Federation HTTP 入口地址。 */
  base_url: string;
  /** 自定义 fetch 实现。 */
  fetch?: FetchLike;
  /** 请求头增强函数。 */
  with_auth(init: RequestInitLike): RequestInitLike;
}): CityRequester {
  const base_url = normalizeBaseURL(options.base_url, "base_url");
  const fetch_impl = options.fetch ?? defaultFetch();
  return {
    base_url,
    json: (path, init) => requestJSON({
      fetch: fetch_impl,
      url: `${base_url}${path}`,
      init: options.with_auth(init),
    }),
    text: (path, init) => requestText({
      fetch: fetch_impl,
      url: `${base_url}${path}`,
      init: options.with_auth(init),
    }),
    raw: (path, init) => requestRaw({
      fetch: fetch_impl,
      url: `${base_url}${path}`,
      init: options.with_auth(init),
    }),
  };
}

/**
 * 创建 Federation RPC 请求器。
 */
export function create_rpc_requester(options: {
  /** Federation RPC 入口地址。 */
  base_url: string;
  /** 本机可信身份。 */
  identity: FederationRpcIdentity;
}): CityRequester {
  const base_url = normalizeBaseURL(options.base_url, "base_url");
  const request = async (path: string, init: RequestInitLike): Promise<FederationRpcResponseData> => {
    const response = await request_federation_rpc({
      url: base_url,
      identity: options.identity,
      method: init.method ?? "GET",
      path,
      headers: init.headers,
      body: init.body,
    });
    if (response.status < 200 || response.status >= 300) {
      throw rpc_error(response);
    }
    return response;
  };
  return {
    base_url,
    json: async <T>(path: string, init: RequestInitLike) => JSON.parse((await request(path, init)).body) as T,
    text: async (path, init) => (await request(path, init)).body,
    raw: async (path, init) => response_like(await request(path, init)),
  };
}

/**
 * 判断 URL 是否为本机 Federation RPC。
 */
export function is_rpc_url(value: string): boolean {
  return /^rpc:\/\//i.test(value);
}

function rpc_error(response: FederationRpcResponseData): Error {
  const error = new Error(`Downcity request failed with ${response.status}: ${response.body}`) as Error & {
    status?: number;
    body?: string;
  };
  error.status = response.status;
  error.body = response.body;
  return error;
}

function response_like(response: FederationRpcResponseData): FetchResponseLike {
  const body = encode_body(response.body);
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    body,
    json: async () => JSON.parse(response.body),
    text: async () => response.body,
  };
}

function encode_body(body: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunk = encoder.encode(body);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
}
