/**
 * Chrome 扩展后台服务入口。
 *
 * 关键点（中文）：
 * - 代 content script 执行 Console HTTP 请求。
 * - 避免 HTTPS 页面内直接请求 HTTP 本机服务导致 Mixed Content 拦截。
 */

import type {
  DowncityExtensionHttpRequest,
  DowncityExtensionHttpRequestMessage,
  DowncityExtensionHttpResponse,
} from "../types/backgroundHttp";

const HTTP_REQUEST_MESSAGE_TYPE = "downcity.extension.http.request";

function normalizeHeaderRecord(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const headerName = String(key || "").trim();
    if (!headerName) continue;
    out[headerName] = String(value ?? "");
  }
  return out;
}

function normalizeHttpRequest(input: unknown): DowncityExtensionHttpRequest {
  if (!input || typeof input !== "object") {
    throw new Error("HTTP 请求参数无效");
  }

  const value = input as Partial<DowncityExtensionHttpRequest>;
  const url = String(value.url || "").trim();
  if (!url) {
    throw new Error("HTTP 请求 URL 不能为空");
  }

  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 HTTP/HTTPS 请求");
  }

  return {
    url: parsed.toString(),
    method: String(value.method || "GET").trim().toUpperCase() || "GET",
    headers: normalizeHeaderRecord(value.headers),
    body: value.body === undefined ? undefined : String(value.body),
  };
}

async function performHttpRequest(
  request: DowncityExtensionHttpRequest,
): Promise<DowncityExtensionHttpResponse> {
  const response = await fetch(request.url, {
    method: request.method || "GET",
    headers: request.headers || {},
    body: request.body,
  });

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    text: await response.text(),
  };
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const typed = message as Partial<DowncityExtensionHttpRequestMessage>;
  if (typed?.type !== HTTP_REQUEST_MESSAGE_TYPE) {
    return false;
  }

  void (async () => {
    try {
      const request = normalizeHttpRequest(typed.request);
      sendResponse(await performHttpRequest(request));
    } catch (error) {
      sendResponse({
        ok: false,
        status: 0,
        statusText: "",
        text: "",
        error: error instanceof Error ? error.message : String(error),
      } satisfies DowncityExtensionHttpResponse);
    }
  })();

  return true;
});
