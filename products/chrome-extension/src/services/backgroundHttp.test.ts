/**
 * Content Script 后台 HTTP 桥测试。
 *
 * 关键点（中文）：
 * - HTTPS 页面中的 content script 不能直接请求 `http://127.0.0.1`，否则会触发 Mixed Content。
 * - 请求必须通过 `chrome.runtime.sendMessage` 转交 background service worker 执行。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { requestViaBackground } from "./backgroundHttp.ts";

test("requestViaBackground forwards HTTP requests through runtime messaging", async () => {
  const originalChrome = globalThis.chrome;
  const capturedMessages: unknown[] = [];

  globalThis.chrome = {
    runtime: {
      lastError: undefined,
      sendMessage(message: unknown, callback: (response: unknown) => void) {
        capturedMessages.push(message);
        callback({
          ok: true,
          status: 200,
          statusText: "OK",
          text: JSON.stringify({ success: true }),
        });
      },
    },
  } as typeof chrome;

  try {
    const response = await requestViaBackground({
      url: "http://127.0.0.1:5315/api/ui/agents",
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dc_test_token",
      },
    });

    assert.deepEqual(response, {
      ok: true,
      status: 200,
      statusText: "OK",
      text: JSON.stringify({ success: true }),
    });
    assert.deepEqual(capturedMessages, [
      {
        type: "downcity.extension.http.request",
        request: {
          url: "http://127.0.0.1:5315/api/ui/agents",
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer dc_test_token",
          },
        },
      },
    ]);
  } finally {
    globalThis.chrome = originalChrome;
  }
});
