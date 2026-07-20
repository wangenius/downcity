/**
 * @file 验证 Session 使用完整工具事务续接 OpenAI Responses。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages } from "ai";

/** 捕获 AI SDK 在指定 store 策略下生成的 Responses 请求体。 */
async function capture_request_body(store) {
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
    openai.responses("gpt-5").doGenerate({
      prompt: messages,
      providerOptions: { openai: { store } },
    }),
    /request captured/,
  );
  return request_body;
}

test("Responses store=false 发送完整 function_call", async () => {
  const request_body = await capture_request_body(false);
  assert.deepEqual(request_body.input, [
    {
      type: "function_call",
      call_id: "call_1",
      name: "lookup",
      arguments: "{\"q\":\"x\"}",
      id: "fc_1",
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "ok",
    },
  ]);
  assert.equal(
    request_body.input.some((item) => item.type === "item_reference"),
    false,
  );
});

test("Responses store=true 使用已存储 item_reference", async () => {
  const request_body = await capture_request_body(true);
  assert.deepEqual(request_body.input, [
    {
      type: "item_reference",
      id: "fc_1",
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "ok",
    },
  ]);
});
