/**
 * 扩展 HTTP 请求工具测试（node:test）。
 *
 * 关键点（中文）：
 * - 当用户配置了 Bearer Token 时，请求层必须自动附加 `Authorization`。
 * - 否则统一鉴权开启后，所有扩展请求都会被 Console 拒绝。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { requestJson } from "./http";

test("requestJson injects bearer token when auth token is provided", async () => {
  const originalFetch = globalThis.fetch;
  const captured: {
    url: string;
    authorization: string | null;
    contentType: string | null;
    method: string;
  }[] = [];

  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers || {});
    captured.push({
      url: String(input),
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      method: String(init?.method || "GET").toUpperCase(),
    });
    return Response.json({ success: true });
  };

  try {
    const payload = await requestJson<{ success: boolean }>(
      "http://127.0.0.1:5315/api/ui/agents",
      { method: "GET" },
      { authToken: "dc_test_token" },
    );

    assert.equal(payload.success, true);
    assert.deepEqual(captured, [
      {
        url: "http://127.0.0.1:5315/api/ui/agents",
        authorization: "Bearer dc_test_token",
        contentType: "application/json",
        method: "GET",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
