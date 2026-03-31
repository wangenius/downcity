/**
 * 用户可见文本与最终回发决策测试（node:test）。
 *
 * 覆盖点（中文）
 * - 多 step 已直发时，最终 merged assistant 文本不应再次回放。
 * - 若最终可见文本来自 `chat_send`，则视为已送达，不再二次回发。
 * - 没有 step 直发时，普通 assistant 文本仍应作为最终回发内容。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { resolveFinalChannelDispatchPlan } from "../../bin/services/chat/runtime/UserVisibleText.js";

function createAssistantMessage(parts, extra) {
  return {
    id: "a:test:1",
    role: "assistant",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId: "ctx_test",
      ...(extra ? { extra } : {}),
    },
    parts,
  };
}

test("resolveFinalChannelDispatchPlan skips replay when final text is merged from dispatched steps", () => {
  const message = createAssistantMessage([
    { type: "text", text: "第一步：收到。" },
    { type: "text", text: "第二步：我现在去处理。" },
  ]);

  const plan = resolveFinalChannelDispatchPlan({
    assistantMessage: message,
    directDispatchedStepTexts: ["第一步：收到。", "第二步：我现在去处理。"],
  });

  assert.deepEqual(plan, {
    text: "",
    alreadyDelivered: true,
    reason: "step_replay",
  });
});

test("resolveFinalChannelDispatchPlan prefers successful chat_send text and skips final replay", () => {
  const message = createAssistantMessage([
    { type: "text", text: "内部过程说明" },
    {
      type: "tool-call",
      toolName: "chat_send",
      input: { text: "真正发给用户的话" },
      state: "output-available",
      output: { success: true },
    },
  ]);

  const plan = resolveFinalChannelDispatchPlan({
    assistantMessage: message,
    directDispatchedStepTexts: [],
  });

  assert.deepEqual(plan, {
    text: "",
    alreadyDelivered: true,
    reason: "chat_send",
  });
});

test("resolveFinalChannelDispatchPlan returns assistant text when nothing was delivered before", () => {
  const message = createAssistantMessage([
    { type: "text", text: "最终正常回复" },
  ]);

  const plan = resolveFinalChannelDispatchPlan({
    assistantMessage: message,
    directDispatchedStepTexts: [],
  });

  assert.deepEqual(plan, {
    text: "最终正常回复",
    alreadyDelivered: false,
    reason: "assistant_text",
  });
});
