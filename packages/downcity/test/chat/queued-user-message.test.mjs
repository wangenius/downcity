/**
 * QueuedUserMessage 入站信息测试（node:test）。
 *
 * 关键点（中文）
 * - `<info>` 应只保留 user/request 元信息，不再混入 chat 路由字段。
 * - 当上游显式提供用户时区/IP 时，应被写入 `<info>`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { buildQueuedUserMessageWithInfo } from "../../bin/services/chat/runtime/QueuedUserMessage.js";

test("buildQueuedUserMessageWithInfo keeps only user and request info fields", () => {
  const text = buildQueuedUserMessageWithInfo({
    messageId: "2828",
    userId: "8444574557",
    username: "wangenius",
    roleId: "master",
    permissions: ["chat.dm.use", "agent.manage"],
    receivedAt: "2026-03-24T15:00:38.495Z",
    userTimezone: "Asia/Shanghai",
    text: "几点了？",
  });

  assert.equal(text.includes("message_id: 2828"), true);
  assert.equal(text.includes("user_id: 8444574557"), true);
  assert.equal(text.includes("username: wangenius"), true);
  assert.equal(text.includes("role_id: master"), true);
  assert.equal(text.includes("permissions: chat.dm.use,agent.manage"), true);
  assert.equal(text.includes("received_at: 2026-03-24T15:00:38.495Z"), true);
  assert.equal(text.includes("user_timezone: Asia/Shanghai"), true);
  assert.equal(text.includes("user_ip:"), false);
  assert.equal(text.includes("channel:"), false);
  assert.equal(text.includes("context_id:"), false);
  assert.equal(text.includes("chat_key:"), false);
  assert.equal(text.includes("chat_id:"), false);
  assert.equal(text.includes("chat_type:"), false);
  assert.equal(text.includes("thread_id:"), false);
});
