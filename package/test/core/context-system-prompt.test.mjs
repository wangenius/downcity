/**
 * Context system prompt 测试（node:test）。
 *
 * 关键点（中文）
 * - chat 模式不再在“第一个 system”注入 runtime context 与 user-facing 规则。
 * - task 模式仍保留 runtime context + task-run output rules。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { buildContextSystemPrompt } from "../../bin/core/prompts/System.js";

test("buildContextSystemPrompt returns empty text for chat mode", () => {
  const prompt = buildContextSystemPrompt({
    projectRoot: "/tmp/demo",
    contextId: "telegram-chat--123",
    requestId: "req-1",
    mode: "chat",
  });
  assert.equal(prompt, "");
});

test("buildContextSystemPrompt keeps runtime context and task rules for task mode", () => {
  const prompt = buildContextSystemPrompt({
    projectRoot: "/tmp/demo",
    contextId: "task-run--123",
    requestId: "req-2",
    mode: "task",
  });
  assert.equal(prompt.includes("Runtime context:"), true);
  assert.equal(prompt.includes("- Project root: /tmp/demo"), true);
  assert.equal(prompt.includes("- ContextId: task-run--123"), true);
  assert.equal(prompt.includes("- Request ID: req-2"), true);
  assert.equal(prompt.includes("Task-run output rules:"), true);
});
