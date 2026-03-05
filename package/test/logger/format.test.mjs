/**
 * LLM 日志格式测试（node:test）。
 *
 * 关键点（中文）
 * - 确认请求日志使用 `[key]: value`。
 * - 确认消息角色输出为 `[user]:`、`[assistant]:`、`[item:xxx]:`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { parseFetchRequestForLog } from "../../bin/utils/logger/Format.js";

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
        name: "exec_command",
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

  assert.match(requestText, /\[method\]: POST/);
  assert.match(requestText, /\[url\]: https:\/\/example\.com\/v1\/responses/);
  assert.match(requestText, /\[model\]: gpt-5\.2/);
  assert.match(requestText, /\[user\]:/);
  assert.match(requestText, /\[assistant\]:/);
  assert.match(requestText, /\[item:function_call_output\]:/);
});

test("parseFetchRequestForLog prints exec_command cmd for item:function_call", () => {
  const payload = {
    model: "gpt-5.2",
    input: [
      {
        type: "function_call",
        name: "exec_command",
        call_id: "call_123",
        arguments: JSON.stringify({
          cmd: "ls -la .ship/task",
          yield_time_ms: 1000,
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
  assert.match(requestText, /\[item:function_call\]:/);
  assert.match(requestText, /name=exec_command/);
  assert.match(requestText, /call_id=call_123/);
  assert.match(requestText, /cmd=ls -la \.ship\/task/);
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
  assert.match(requestText, /\[system\]: 你是一个严格执行规则的助手/);
  assert.equal(parsed.system, "你是一个严格执行规则的助手");
});
