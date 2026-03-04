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

