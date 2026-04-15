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
  buildSessionSystemMessages,
  buildContextSystemPrompt,
} from "../../bin/session/composer/system/default/SystemDomain.js";

test("buildContextSystemPrompt returns empty text for chat mode", () => {
  const prompt = buildContextSystemPrompt({
    projectRoot: "/tmp/demo",
    contextId: "telegram-chat--123",
    mode: "chat",
  });
  assert.equal(prompt, "");
});

test("buildContextSystemPrompt keeps runtime context and task rules for task mode", () => {
  const prompt = buildContextSystemPrompt({
    projectRoot: "/tmp/demo",
    contextId: "task-run--123",
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
    DEFAULT_SHIP_PROMPTS.includes("如果入站 `<info>` 明确提供了 `user_timezone`"),
    true,
  );
});

test("buildSessionSystemMessages appends runtime clock context for chat and task", async () => {
  const chatMessages = await buildSessionSystemMessages({
    projectRoot: "/tmp/demo",
    sessionId: "session_chat",
    mode: "chat",
    staticSystemPrompts: [DEFAULT_SHIP_PROMPTS],
    serviceSystemPrompts: [],
    pluginSystemPrompts: [],
  });
  const chatTail = chatMessages.at(-1)?.content || "";
  assert.equal(chatTail.includes("# Runtime Clock Context"), true);
  assert.equal(chatTail.includes("current_date:"), true);
  assert.equal(chatTail.includes("timezone:"), true);

  const taskMessages = await buildSessionSystemMessages({
    projectRoot: "/tmp/demo",
    sessionId: "session_task",
    mode: "task",
    staticSystemPrompts: [DEFAULT_SHIP_PROMPTS],
    serviceSystemPrompts: [],
    pluginSystemPrompts: [],
  });
  const taskTail = taskMessages.at(-1)?.content || "";
  assert.equal(taskTail.includes("# Runtime Clock Context"), true);
  assert.equal(taskTail.includes("session_id: session_task"), true);
});
