/**
 * Session step timeline 持久化测试。
 *
 * 关键点（中文）
 * - step 持久化必须按 `tool-call -> tool-result -> text` 顺序落盘。
 * - 一旦 step 已单独落盘，最终 merged assistant 不应再次写入 session。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistantStepTimelineMessages } from "../../bin/sessions@/city/runtime/console/AssistantStepTimeline.js";
import { resolveAssistantMessageForPersistence } from "../../bin/services/chat@/city/runtime/console/UserVisibleText.js";

test("buildAssistantStepTimelineMessages persists text, tool call, and tool result in order", () => {
  const messages = buildAssistantStepTimelineMessages({
    sessionId: "consoleui-chat-main",
    requestId: "req-1",
    stepIndex: 1,
    text: "最终总结",
    stepResult: {
      toolCalls: [
        {
          toolName: "search_memory",
          toolCallId: "call_1",
          input: { query: "city" },
        },
      ],
      toolResults: [
        {
          toolName: "search_memory",
          toolCallId: "call_1",
          output: { items: ["downcity"] },
        },
      ],
    },
  });

  assert.equal(messages.length, 3);
  assert.equal(messages[0].parts[0].type, "text");
  assert.equal(messages[0].parts[0].text, "最终总结");
  assert.equal(messages[1].parts[0].type, "tool-call");
  assert.equal(messages[1].parts[0].toolName, "search_memory");
  assert.deepEqual(messages[1].parts[0].input, { query: "city" });
  assert.equal(messages[2].parts[0].type, "tool-result");
  assert.equal(messages[2].parts[0].toolName, "search_memory");
  assert.deepEqual(messages[2].parts[0].result, { items: ["downcity"] });
});

test("buildAssistantStepTimelineMessages keeps text-only step minimal", () => {
  const messages = buildAssistantStepTimelineMessages({
    sessionId: "consoleui-chat-main",
    stepIndex: 2,
    text: "只有文本",
    stepResult: {},
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].parts[0].type, "text");
  assert.equal(messages[0].parts[0].text, "只有文本");
});

test("resolveAssistantMessageForPersistence skips merged assistant after step persistence", () => {
  const persisted = resolveAssistantMessageForPersistence({
    id: "a:test:1",
    role: "assistant",
    metadata: {
      v: 1,
      ts: 1,
      sessionId: "consoleui-chat-main",
      extra: {
        assistantStepMessagesPersisted: true,
      },
    },
    parts: [
      { type: "text", text: "最终回复正文" },
      {
        type: "tool-call",
        toolName: "search_memory",
        input: { query: "city" },
      },
    ],
  });

  assert.equal(persisted, null);
});
