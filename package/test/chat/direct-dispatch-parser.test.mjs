/**
 * direct dispatch parser 行为测试（node:test）。
 *
 * 关键点（中文）
 * - direct frontmatter 仅支持 `chatKey/reply/message_id/react` 等字段。
 * - `delay/time/sendAt/sendAtMs` 在 direct 模式下应被忽略，不能进入发送参数。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { parseDirectDispatchAssistantText } from "../../bin/services/chat/runtime/DirectDispatchParser.js";

test("parseDirectDispatchAssistantText ignores delay/time metadata in direct mode", () => {
  const plan = parseDirectDispatchAssistantText({
    fallbackChatKey: "telegram-chat-999",
    assistantText: `---
chatKey: telegram-chat-123
reply: "556"
delay: 3000
time: 2026-03-08T20:00:00+08:00
sendAt: 2026-03-08T21:00:00+08:00
sendAtMs: 1767225600000
react: "👍"
---
hello direct`,
  });

  assert.ok(plan, "expected non-null direct dispatch plan");
  assert.ok(plan.text, "expected text plan");
  assert.equal(plan.text.chatKey, "telegram-chat-123");
  assert.equal(plan.text.replyToMessage, true);
  assert.equal(plan.text.messageId, "556");
  assert.equal(plan.text.text, "hello direct");

  // 关键点（中文）：delay/time 字段必须被忽略，避免 direct 自动调度。
  assert.equal(Object.hasOwn(plan.text, "delayMs"), false);
  assert.equal(Object.hasOwn(plan.text, "sendAtMs"), false);

  assert.equal(plan.reactions.length, 1);
  assert.equal(plan.reactions[0].emoji, "👍");
  assert.equal(plan.reactions[0].chatKey, "telegram-chat-123");
  assert.equal(plan.reactions[0].messageId, "556");
});
