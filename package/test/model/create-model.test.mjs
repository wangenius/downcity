/**
 * CreateModel 测试（node:test）。
 *
 * 关键点（中文）
 * - 测试对象是 `src` 的编译产物（`bin`），确保运行时代码可执行。
 * - 使用 mock fetch 避免网络依赖，稳定验证模型调用链路。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { generateText } from "ai";
import { createModel } from "../../bin/core/llm/CreateModel.js";

function createBaseConfig() {
  return {
    name: "test-agent",
    version: "1.0.0",
    llm: {
      provider: "custom",
      model: "gpt-5.2",
      baseUrl: "https://example.com/v1",
      apiKey: "test-api-key",
      logMessages: false,
    },
  };
}

function resolveRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

test("createModel: custom provider can generate text with mocked responses endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const mockFetchCalls = [];

  globalThis.fetch = async (input, init) => {
    mockFetchCalls.push({
      url: resolveRequestUrl(input),
      method: init?.method || "POST",
      body: typeof init?.body === "string" ? init.body : "",
    });

    return new Response(
      JSON.stringify({
        id: "resp_1",
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        model: "gpt-5.2",
        output: [
          {
            id: "msg_1",
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "OK",
                annotations: [],
              },
            ],
          },
        ],
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          total_tokens: 2,
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    const model = await createModel({ config: createBaseConfig() });
    const result = await generateText({
      model,
      prompt: "reply OK",
      maxOutputTokens: 16,
    });

    assert.equal(result.text.trim(), "OK");
    assert.equal(mockFetchCalls.length, 1);
    assert.equal(mockFetchCalls[0].url, "https://example.com/v1/responses");
    assert.match(mockFetchCalls[0].body, /"model":"gpt-5\.2"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createModel: throws when model is missing", async () => {
  const config = createBaseConfig();
  config.llm.model = "${}";
  await assert.rejects(
    () => createModel({ config }),
    /no LLM Model Configured/i,
  );
});

test("createModel: throws when api key is missing and env fallback is empty", async () => {
  const config = createBaseConfig();
  delete config.llm.apiKey;

  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldGeneric = process.env.API_KEY;

  process.env.ANTHROPIC_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  process.env.API_KEY = "";

  try {
    await assert.rejects(
      () => createModel({ config }),
      /No API Key configured/i,
    );
  } finally {
    if (oldAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = oldAnthropic;

    if (oldOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAI;

    if (oldGeneric === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = oldGeneric;
  }
});
