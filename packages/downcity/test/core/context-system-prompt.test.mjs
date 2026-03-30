/**
 * Context system prompt 测试（node:test）。
 *
 * 关键点（中文）
 * - chat 模式不再在“第一个 system”注入 runtime context 与 user-facing 规则。
 * - task 模式仍保留 runtime context + task-run output rules。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SHIP_PROMPTS,
  buildContextSystemPrompt,
} from "../../bin/sessions/prompts/System.js";

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
  assert.equal(prompt.includes("Task runtime context:"), true);
  assert.equal(prompt.includes("- Project root: /tmp/demo"), true);
  assert.equal(prompt.includes("- ContextId: task-run--123"), false);
  assert.equal(prompt.includes("- Request ID: req-2"), false);
  assert.equal(prompt.includes("Task-run output rules:"), true);
});

test("default core prompt enforces decisive execution and preflight checks", () => {
  assert.equal(DEFAULT_SHIP_PROMPTS.includes("默认先执行，再沟通"), true);
  assert.equal(
    DEFAULT_SHIP_PROMPTS.includes("先探测可用性，再决定是否承诺“我来创建/发送/写入”"),
    true,
  );
  assert.equal(
    DEFAULT_SHIP_PROMPTS.includes("应先按当前用户时区解析为绝对时间"),
    true,
  );
});
