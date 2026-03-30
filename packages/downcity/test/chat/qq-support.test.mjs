/**
 * QQ 渠道辅助逻辑测试（node:test）。
 *
 * 关键点（中文）
 * - 命令映射应稳定返回预期动作与回复文案。
 * - READY 事件身份解析应兼容多种字段回退顺序。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  extractQqReadyIdentity,
  resolveQqCommandAction,
} from "../../bin/services/chat/channels/qq/QQSupport.js";

test("resolveQqCommandAction maps clear command to clear action", () => {
  const result = resolveQqCommandAction("/清除");

  assert.equal(result.action, "clear_chat");
  assert.equal(result.responseText, "✅ 对话已彻底删除");
});

test("resolveQqCommandAction returns fallback text for unknown command", () => {
  const result = resolveQqCommandAction("/unknown demo");

  assert.equal(result.action, "reply_only");
  assert.match(result.responseText, /未知命令/);
  assert.match(result.responseText, /\/help/);
});

test("extractQqReadyIdentity prefers top-level ready user identity fields", () => {
  const result = extractQqReadyIdentity({
    context_id: "ctx_123",
    user: {
      username: "Downcity Bot",
      user_openid: "bot_openid_1",
    },
  });

  assert.equal(result.wsContextId, "ctx_123");
  assert.equal(result.botDisplayName, "Downcity Bot");
  assert.equal(result.botUserId, "bot_openid_1");
});

test("extractQqReadyIdentity falls back to nested user fields", () => {
  const result = extractQqReadyIdentity({
    user: {
      user: {
        nickname: "Nested Bot",
      },
      openid: "nested_openid",
    },
  });

  assert.equal(result.botDisplayName, "Nested Bot");
  assert.equal(result.botUserId, "nested_openid");
});
