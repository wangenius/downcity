/**
 * Content Script 后台 HTTP 桥客户端。
 *
 * 关键点（中文）：
 * - HTTPS 页面里的 content script 不直接 `fetch(http://...)`。
 * - 统一通过 background service worker 代发 Console 请求，避开 Mixed Content 限制。
 */

import type {
  DowncityExtensionHttpRequest,
  DowncityExtensionHttpRequestMessage,
  DowncityExtensionHttpResponse,
} from "../types/backgroundHttp";

const HTTP_REQUEST_MESSAGE_TYPE = "downcity.extension.http.request";

/**
 * 通过 background service worker 发起 HTTP 请求。
 */
export function requestViaBackground(
  request: DowncityExtensionHttpRequest,
): Promise<DowncityExtensionHttpResponse> {
  return new Promise((resolve, reject) => {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      typeof chrome.runtime.sendMessage !== "function"
    ) {
      reject(new Error("扩展后台通信不可用"));
      return;
    }

    const message: DowncityExtensionHttpRequestMessage = {
      type: HTTP_REQUEST_MESSAGE_TYPE,
      request,
    };

    chrome.runtime.sendMessage(message, (response: unknown) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message || "扩展后台请求失败"));
        return;
      }

      if (!response || typeof response !== "object") {
        reject(new Error("扩展后台返回无效响应"));
        return;
      }

      const payload = response as Partial<DowncityExtensionHttpResponse>;
      if (payload.error) {
        reject(new Error(String(payload.error)));
        return;
      }

      resolve({
        ok: payload.ok === true,
        status:
          typeof payload.status === "number" && Number.isFinite(payload.status)
            ? Math.trunc(payload.status)
            : 0,
        statusText: String(payload.statusText || ""),
        text: String(payload.text || ""),
      });
    });
  });
}
