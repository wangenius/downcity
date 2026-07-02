/**
 * OpenAI-compatible transport 适配模块。
 *
 * 关键点（中文）
 * - 只提供 `baseURL + fetch`，不绑定具体 AI SDK provider。
 * - HTTP Federation 使用 provider 默认 fetch。
 * - RPC Federation 使用 City SDK 的 Federation RPC client，把 OpenAI-compatible
 *   request 原样送到 `/v1/ai/chat/completions` 等 AI endpoint。
 */

import { request_federation_rpc } from "../../rpc-client.js";

/**
 * OpenAI-compatible provider 可复用的 transport 选项。
 */
export interface OpenAICompatibleTransport {
  /**
   * OpenAI-compatible AI endpoint 根地址，例如 `https://host/v1/ai`
   * 或 `rpc://127.0.0.1:15315/v1/ai`。
   */
  baseURL: string;

  /**
   * 自定义 fetch。
   *
   * 关键说明（中文）
   * - HTTP Federation 不需要该字段，provider 使用默认 fetch。
   * - RPC Federation 需要该字段把 request 转成 Federation RPC frame。
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * 创建 OpenAI-compatible transport。
 */
export function create_openai_compatible_transport(
  federation_url: string,
): OpenAICompatibleTransport {
  const baseURL = `${federation_url.replace(/\/+$/, "")}/v1/ai`;
  if (!is_rpc_url(federation_url)) {
    return { baseURL };
  }
  return {
    baseURL,
    fetch: create_federation_rpc_fetch(federation_url),
  };
}

/**
 * 创建给 AI SDK provider 使用的 RPC fetch。
 */
export function create_federation_rpc_fetch(
  federation_url: string,
): typeof globalThis.fetch {
  return async (input, init) => {
    assert_supported_body(init?.body);
    const request = new Request(input, init);
    assert_supported_request(request);
    const url = new URL(request.url);
    const response = await request_federation_rpc({
      url: federation_url,
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers: headers_to_record(request.headers),
      body: await read_request_body(request),
    });
    return new Response(empty_response_body(response.status) ? null : response.body, {
      status: response.status,
      headers: response.headers,
    });
  };
}

function is_rpc_url(value: string): boolean {
  return /^rpc:\/\//i.test(value);
}

function headers_to_record(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

async function read_request_body(request: Request): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  return await request.text();
}

function assert_supported_body(body: BodyInit | null | undefined): void {
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    throw new TypeError("Downcity RPC OpenAI-compatible transport does not support FormData body");
  }
}

function assert_supported_request(request: Request): void {
  const content_type = request.headers.get("content-type") ?? "";
  if (/^multipart\/form-data\b/i.test(content_type)) {
    throw new TypeError("Downcity RPC OpenAI-compatible transport does not support multipart/form-data body");
  }
}

function empty_response_body(status: number): boolean {
  return status === 204 || status === 205 || status === 304;
}
