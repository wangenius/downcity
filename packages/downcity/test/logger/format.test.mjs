/**
 * LLM 日志格式测试（node:test）。
 *
 * 关键点（中文）
 * - 确认请求日志使用紧凑标签 `[key] value`。
 * - 确认消息角色输出为 `[user]`、`[assistant]`、`[tool]`、`[tool_result]`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { parseFetchRequestForLog } from "../../bin/shared/utils/logger/Format.js";

test("parseFetchRequestForLog formats messages with compact role labels", () => {
  const payload = {
    model: "gpt-5.2",
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "hello" }],
      },
      {
        role: "assistant",
        content: [{ type: "output_text", text: "world" }],
      },
      {
        type: "function_call_output",
        name: "shell_start",
        output: "done",
      },
    ],
  };

  const parsed = parseFetchRequestForLog("https://example.com/v1/responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  assert.ok(parsed);
  const requestText = parsed.requestText;

  assert.match(requestText, /\[user\] hello/);
  assert.match(requestText, /\[assistant\] world/);
  assert.match(requestText, /\[tool_result\] done/);
});

test("parseFetchRequestForLog prints shell_start cmd for item:function_call", () => {
  const payload = {
    model: "gpt-5.2",
    input: [
      {
        type: "function_call",
        name: "shell_start",
        call_id: "call_456",
        arguments: JSON.stringify({
          cmd: "python worker.py --task demo",
          inline_wait_ms: 1200,
        }),
      },
    ],
  };

  const parsed = parseFetchRequestForLog("https://example.com/v1/responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  assert.ok(parsed);
  const requestText = parsed.requestText;
  assert.match(requestText, /\[tool\] shell_start \| cmd=python worker\.py --task demo/);
  assert.match(requestText, /cmd=python worker\.py --task demo/);
});

test("parseFetchRequestForLog prints shell_exec cmd for item:function_call", () => {
  const payload = {
    model: "gpt-5.2",
    input: [
      {
        type: "function_call",
        name: "shell_exec",
        call_id: "call_789",
        arguments: JSON.stringify({
          cmd: "git status --short",
          timeout_ms: 60000,
        }),
      },
    ],
  };

  const parsed = parseFetchRequestForLog("https://example.com/v1/responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  assert.ok(parsed);
  const requestText = parsed.requestText;
  assert.match(requestText, /\[tool\] shell_exec \| cmd=git status --short/);
  assert.match(requestText, /cmd=git status --short/);
});

test("parseFetchRequestForLog prints instructions as system for responses payload", () => {
  const payload = {
    model: "gpt-5.2",
    instructions: "你是一个严格执行规则的助手",
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "hi" }],
      },
    ],
  };

  const parsed = parseFetchRequestForLog("https://example.com/v1/responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  assert.ok(parsed);
  const requestText = parsed.requestText;
  assert.match(requestText, /\[system\] 你是一个严格执行规则的助手/);
  assert.equal(parsed.system, "你是一个严格执行规则的助手");
});

test("parseFetchRequestForLog keeps full system content without truncation", () => {
  const longSystem = "S".repeat(2500);
  const payload = {
    model: "gpt-5.2",
    instructions: longSystem,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "check" }],
      },
    ],
  };

  const parsed = parseFetchRequestForLog("https://example.com/v1/responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  assert.ok(parsed);
  const requestText = parsed.requestText;
  assert.equal(requestText.includes(`[system] ${longSystem}`), true);
  assert.equal(requestText.includes("…(truncated"), false);
});
