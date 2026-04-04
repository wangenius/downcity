/**
 * 扩展鉴权工具测试（node:test）。
 *
 * 关键点（中文）：
 * - 配置了 Bearer Token 后，Header 必须自动补齐。
 * - 配置了 Bearer Token 后，任务投递不能继续走 `sendBeacon`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAuthHeaders,
  fetchConsoleAuthStatus,
  isAuthErrorMessage,
  loginConsole,
  shouldUseBeaconTransport,
} from "./auth";

test("buildAuthHeaders injects bearer authorization when auth token is provided", () => {
  const headers = buildAuthHeaders({
    authToken: "dc_test_token",
    headers: {
      "Content-Type": "application/json",
    },
  });

  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("authorization"), "Bearer dc_test_token");
});

test("shouldUseBeaconTransport returns false when auth token exists", () => {
  assert.equal(shouldUseBeaconTransport("dc_test_token"), false);
  assert.equal(shouldUseBeaconTransport(""), true);
});

test("fetchConsoleAuthStatus reads public auth status from console", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      success: true,
      initialized: true,
      requireLogin: true,
    });

  try {
    const result = await fetchConsoleAuthStatus({
      consoleBaseUrl: "http://127.0.0.1:5315",
    });
    assert.deepEqual(result, {
      success: true,
      initialized: true,
      requireLogin: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loginConsole returns normalized local auth state after login", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      success: true,
      user: {
        username: "alice",
      },
      token: {
        token: "Bearer dc_login_token",
      },
    });

  try {
    const result = await loginConsole({
      consoleBaseUrl: "http://127.0.0.1:5315",
      username: "alice",
      password: "secret",
    });
    assert.deepEqual(result, {
      token: "dc_login_token",
      username: "alice",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("isAuthErrorMessage detects auth failures", () => {
  assert.equal(isAuthErrorMessage("Missing bearer token"), true);
  assert.equal(isAuthErrorMessage("Permission denied"), true);
  assert.equal(isAuthErrorMessage("network timeout"), false);
});
