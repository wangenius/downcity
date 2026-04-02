/**
 * Console UI Plugin 路由测试（node:test）。
 *
 * 关键点（中文）
 * - `/api/ui/plugins` 访问 agent runtime 时，必须继续转发当前请求的 Bearer Token。
 * - 否则统一鉴权开启后，plugin 面板会退化成 `Missing bearer token`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { registerConsoleUiPluginRoutes } from "../../bin/main/ui/PluginApiRoutes.js";

test("ui plugins route forwards bearer token to runtime list and availability requests", async () => {
  const app = new Hono();
  const runtimeRequests = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers || {});
    runtimeRequests.push({
      url,
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      method: String(init?.method || "GET").toUpperCase(),
    });

    if (url.endsWith("/api/plugins/list")) {
      return Response.json({
        success: true,
        plugins: [
          {
            name: "skill",
            title: "Skill",
            description: "skill plugin",
            enabled: true,
          },
        ],
      });
    }

    if (url.endsWith("/api/plugins/availability")) {
      return Response.json({
        success: true,
        availability: {
          available: true,
          enabled: true,
          installed: true,
          configured: true,
          reasons: [],
        },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  };

  registerConsoleUiPluginRoutes({
    app,
    readRequestedAgentId() {
      return "agent-1";
    },
    async resolveSelectedAgent() {
      return {
        id: "agent-1",
        name: "Agent 1",
        projectRoot: "/tmp/agent-1",
        baseUrl: "http://127.0.0.1:4310",
      };
    },
  });

  try {
    const response = await app.request("/api/ui/plugins?agent=agent-1", {
      headers: {
        Authorization: "Bearer dc_test_token",
      },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.runtimeConnected, true);
    assert.equal(runtimeRequests.length, 2);
    assert.deepEqual(
      runtimeRequests.map((item) => ({
        url: item.url,
        method: item.method,
        authorization: item.authorization,
      })),
      [
        {
          url: "http://127.0.0.1:4310/api/plugins/list",
          method: "GET",
          authorization: "Bearer dc_test_token",
        },
        {
          url: "http://127.0.0.1:4310/api/plugins/availability",
          method: "POST",
          authorization: "Bearer dc_test_token",
        },
      ],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
