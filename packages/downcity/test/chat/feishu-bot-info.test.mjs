/**
 * Feishu bot 信息探测测试（node:test）。
 *
 * 关键点（中文）
 * - 官方 `/open-apis/bot/v3/info` 返回体使用 `bot.app_name` / `bot.open_id`。
 * - 需要确保名称与 open_id 能被正确解析，避免误落回 `Feishu Bot xxxxxx`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { FeishuBotInfoProvider } from "../../bin/services/chat/channels/feishu/BotInfo.js";

function createJsonResponse(payload, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

test("FeishuBotInfoProvider reads official bot.app_name and bot.open_id fields", async () => {
  const provider = new FeishuBotInfoProvider();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input || "");
    if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return createJsonResponse({
        code: 0,
        tenant_access_token: "tenant_token_001",
      });
    }
    if (url.endsWith("/open-apis/bot/v3/info")) {
      return createJsonResponse({
        code: 0,
        msg: "ok",
        bot: {
          app_name: "研发助手",
          open_id: "ou_bot_001",
        },
      });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  try {
    const result = await provider.resolve({
      appId: "cli_a1b2c3d4e5",
      appSecret: "secret_value",
    });

    assert.equal(result.channel, "feishu");
    assert.equal(result.name, "研发助手");
    assert.equal(result.identity, "ou_bot_001");
    assert.equal(result.botUserId, "ou_bot_001");
    assert.equal(result.idSeed, "ou_bot_001");
    assert.equal(result.message, "Feishu bot profile fetched");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("FeishuBotInfoProvider keeps compatibility with legacy data fields", async () => {
  const provider = new FeishuBotInfoProvider();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = String(input || "");
    if (url.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return createJsonResponse({
        code: 0,
        tenant_access_token: "tenant_token_002",
      });
    }
    if (url.endsWith("/open-apis/bot/v3/info")) {
      return createJsonResponse({
        code: 0,
        msg: "ok",
        data: {
          app_name: "Legacy Bot Name",
          open_id: "ou_legacy_001",
        },
      });
    }
    throw new Error(`Unexpected fetch url: ${url}`);
  };

  try {
    const result = await provider.resolve({
      appId: "cli_z9y8x7w6v5",
      appSecret: "secret_value",
    });

    assert.equal(result.name, "Legacy Bot Name");
    assert.equal(result.identity, "ou_legacy_001");
    assert.equal(result.botUserId, "ou_legacy_001");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
