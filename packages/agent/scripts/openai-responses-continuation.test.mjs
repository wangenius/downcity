/**
 * @file 验证 AI SDK OpenAI Responses 使用持久化 itemId 生成 HTTP item_reference。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages } from "ai";

test("OpenAI Responses 默认 store 策略使用 item_reference continuation", async () => {
  let request_body;
  const openai = createOpenAI({
    apiKey: "test-api-key",
    fetch: async (_url, init) => {
      request_body = JSON.parse(String(init.body));
      throw new Error("request captured");
    },
  });
  const messages = await convertToModelMessages([{
    role: "assistant",
    parts: [{
      type: "dynamic-tool",
      toolName: "lookup",
      toolCallId: "call_1",
      state: "output-available",
      input: { q: "x" },
      output: "ok",
      callProviderMetadata: { openai: { itemId: "fc_1" } },
    }],
  }]);

  await assert.rejects(
    openai.responses("gpt-5").doGenerate({ prompt: messages }),
    /request captured/,
  );
  assert.deepEqual(request_body.input, [
    { type: "item_reference", id: "fc_1" },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "ok",
    },
  ]);
  assert.equal(
    request_body.input.some((item) => item.type === "function_call"),
    false,
  );
});
