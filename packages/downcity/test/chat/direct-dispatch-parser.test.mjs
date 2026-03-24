/**
 * direct dispatch parser 行为测试（node:test）。
 *
 * 关键点（中文）
 * - direct frontmatter 与 `city chat send` 参数对齐。
 * - `react` 仍作为 direct 模式的额外能力保留。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { parseDirectDispatchAssistantText } from "../../bin/services/chat/runtime/DirectDispatchParser.js";

test("parseDirectDispatchAssistantText aligns frontmatter with chat send options", () => {
  const plan = parseDirectDispatchAssistantText({
    fallbackChatKey: "telegram-chat-999",
    assistantText: `---
chatKey: telegram-chat-123
reply: true
messageId: "778"
delay: 3000
reactions: "❌"
react:
  - emoji: "👍"
    chatKey: "telegram-chat-321"
    messageId: "912"
    big: true
---
hello direct`,
  });

  assert.ok(plan, "expected non-null direct dispatch plan");
  assert.ok(plan.text, "expected text plan");
  assert.equal(plan.text.chatKey, "telegram-chat-123");
  assert.equal(plan.text.replyToMessage, true);
  assert.equal(plan.text.messageId, "778");
  assert.equal(plan.text.text, "hello direct");

  // 关键点（中文）：frontmatter 应按 chat send 语义保留最终调度参数。
  assert.equal(plan.text.delayMs, 3000);
  assert.equal(plan.text.sendAtMs, undefined);

  assert.equal(plan.reactions.length, 1);
  assert.equal(plan.reactions[0].emoji, "👍");
  assert.equal(plan.reactions[0].chatKey, "telegram-chat-123");
  assert.equal(plan.reactions[0].messageId, "778");
  assert.equal(plan.reactions[0].big, true);
});
