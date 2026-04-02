/**
 * ModelSupport 测试（node:test）。
 *
 * 关键点（中文）
 * - 验证 provider discover 的默认入口与鉴权头是否符合当前实现约定。
 * - 本测试覆盖 moonshot-ai / moonshot-cn，防止默认 baseUrl 与运行时 SDK 配置漂移。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { discoverProviderModels } from "../../bin/main/commands/ModelSupport.js";

function resolveRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

test("discoverProviderModels: moonshot-ai uses ai endpoint by default", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    calls.push({
      url: resolveRequestUrl(input),
      method: init?.method || "GET",
      headers: init?.headers,
    });

    return new Response(
      JSON.stringify({
        data: [{ id: "kimi-k2.5" }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const result = await discoverProviderModels({
      providerId: "kimi",
      providerType: "moonshot-ai",
      apiKey: "test-kimi-key",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.models, ["kimi-k2.5"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.moonshot.ai/v1/models");
    const requestHeaders = calls[0].headers || {};
    const normalizedHeaders =
      requestHeaders instanceof Headers
        ? Object.fromEntries(requestHeaders.entries())
        : requestHeaders;
    assert.equal(normalizedHeaders.Authorization, "Bearer test-kimi-key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discoverProviderModels: moonshot-cn uses cn endpoint by default", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    calls.push({
      url: resolveRequestUrl(input),
      method: init?.method || "GET",
      headers: init?.headers,
    });

    return new Response(
      JSON.stringify({
        data: [{ id: "kimi-k2.5" }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const result = await discoverProviderModels({
      providerId: "kimi",
      providerType: "moonshot-cn",
      apiKey: "test-kimi-key",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.models, ["kimi-k2.5"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.moonshot.cn/v1/models");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discoverProviderModels: kimi-code uses coding v1 endpoint by default", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (input, init) => {
    calls.push({
      url: resolveRequestUrl(input),
      method: init?.method || "GET",
      headers: init?.headers,
    });

    return new Response(
      JSON.stringify({
        data: [{ id: "kimi-for-coding" }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const result = await discoverProviderModels({
      providerId: "kimi-code",
      providerType: "kimi-code",
      apiKey: "test-kimi-code-key",
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.models, ["kimi-for-coding"]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.kimi.com/coding/v1/models");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
