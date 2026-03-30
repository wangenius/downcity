/**
 * CreateModel 测试（node:test）。
 *
 * 关键点（中文）
 * - 测试对象是 `bin` 编译产物，确保运行时代码可执行。
 * - 当前模型解析基于 `agent.model.primary + ConsoleStore(SQLite)`。
 * - 使用 mock fetch 避免网络依赖，稳定验证模型调用链路。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import { generateText } from "ai";
import { createModel } from "../../bin/main/model/CreateModel.js";
import { ConsoleStore } from "../../bin/utils/store/index.js";

function createAgentConfig(primaryModelId) {
  return {
    name: "test-agent",
    version: "1.0.0",
    model: {
      primary: primaryModelId,
    },
    llm: {
      logMessages: false,
    },
  };
}

function resolveRequestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function withSeededConsoleStore(t, seed, callback) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-model-store-"));
  const store = new ConsoleStore(path.join(tempDir, "downcity.db"));
  try {
    await store.upsertProvider(seed.provider);
    store.upsertModel(seed.model);
    await callback(store);
  } finally {
    store.close();
    await fs.remove(tempDir);
  }
}

test("createModel: open-responses provider can generate text with mocked responses endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  const mockFetchCalls = [];

  globalThis.fetch = async (input, init) => {
    mockFetchCalls.push({
      url: resolveRequestUrl(input),
      method: init?.method || "POST",
      headers: init?.headers,
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
    await withSeededConsoleStore(
      t,
      {
        provider: {
          id: "default",
          type: "open-responses",
          baseUrl: "https://example.com/v1",
          apiKey: "test-api-key",
        },
        model: {
          id: "default",
          providerId: "default",
          name: "gpt-5.2",
        },
      },
      async (store) => {
        const model = await createModel({
          config: createAgentConfig("default"),
          store,
        });
        const result = await generateText({
          model,
          prompt: "reply OK",
          maxOutputTokens: 16,
        });

        assert.equal(result.text.trim(), "OK");
        assert.equal(mockFetchCalls.length, 1);
        assert.equal(mockFetchCalls[0].url, "https://example.com/v1/responses");
        assert.match(mockFetchCalls[0].body, /"model":"gpt-5\.2"/);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createModel: open-compatible provider uses chat completions endpoint", async (t) => {
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
        id: "chatcmpl_1",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "gpt-4o-mini",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
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
    await withSeededConsoleStore(
      t,
      {
        provider: {
          id: "default",
          type: "open-compatible",
          baseUrl: "https://compatible.example.com/v1",
          apiKey: "test-api-key",
        },
        model: {
          id: "default",
          providerId: "default",
          name: "gpt-4o-mini",
        },
      },
      async (store) => {
        const model = await createModel({
          config: createAgentConfig("default"),
          store,
        });
        const result = await generateText({
          model,
          prompt: "reply OK",
          maxOutputTokens: 16,
        });

        assert.equal(result.text.trim(), "OK");
        assert.equal(mockFetchCalls.length, 1);
        assert.equal(
          mockFetchCalls[0].url,
          "https://compatible.example.com/v1/chat/completions",
        );
        assert.match(mockFetchCalls[0].body, /"model":"gpt-4o-mini"/);
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createModel: moonshot provider uses chat completions endpoint with default base url", async (t) => {
  const originalFetch = globalThis.fetch;
  const mockFetchCalls = [];

  globalThis.fetch = async (input, init) => {
    mockFetchCalls.push({
      url: resolveRequestUrl(input),
      method: init?.method || "POST",
      headers: init?.headers,
      body: typeof init?.body === "string" ? init.body : "",
    });

    return new Response(
      JSON.stringify({
        id: "chatcmpl_1",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "moonshot-v1-8k",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "OK" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
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
    await withSeededConsoleStore(
      t,
      {
        provider: {
          id: "moonshot",
          type: "moonshot",
          apiKey: "test-moonshot-key",
        },
        model: {
          id: "default",
          providerId: "moonshot",
          name: "moonshot-v1-8k",
        },
      },
      async (store) => {
        const model = await createModel({
          config: createAgentConfig("default"),
          store,
        });
        const result = await generateText({
          model,
          prompt: "reply OK",
          maxOutputTokens: 16,
        });

        assert.equal(result.text.trim(), "OK");
        assert.equal(mockFetchCalls.length, 1);
        assert.equal(
          mockFetchCalls[0].url,
          "https://api.moonshot.cn/v1/chat/completions",
        );
        const requestHeaders = mockFetchCalls[0].headers || {};
        const normalizedHeaders =
          requestHeaders instanceof Headers
            ? Object.fromEntries(requestHeaders.entries())
            : requestHeaders;
        assert.equal(normalizedHeaders.authorization, "Bearer test-moonshot-key");
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createModel: gemini provider uses native google endpoint", async (t) => {
  const originalFetch = globalThis.fetch;
  const mockFetchCalls = [];

  globalThis.fetch = async (input, init) => {
    mockFetchCalls.push({
      url: resolveRequestUrl(input),
      method: init?.method || "POST",
      headers: init?.headers,
      body: typeof init?.body === "string" ? init.body : "",
    });

    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "OK",
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };

  try {
    await withSeededConsoleStore(
      t,
      {
        provider: {
          id: "google",
          type: "gemini",
          apiKey: "test-gemini-key",
        },
        model: {
          id: "quality",
          providerId: "google",
          name: "gemini-2.5-pro",
        },
      },
      async (store) => {
        const model = await createModel({
          config: createAgentConfig("quality"),
          store,
        });
        const result = await generateText({
          model,
          prompt: "reply OK",
          maxOutputTokens: 16,
        });

        assert.equal(result.text.trim(), "OK");
        assert.equal(mockFetchCalls.length, 1);
        assert.match(
          mockFetchCalls[0].url,
          /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-pro:generateContent$/,
        );
        const requestHeaders = mockFetchCalls[0].headers || {};
        const normalizedHeaders =
          requestHeaders instanceof Headers
            ? Object.fromEntries(requestHeaders.entries())
            : requestHeaders;
        assert.equal(normalizedHeaders["x-goog-api-key"], "test-gemini-key");
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createModel: throws when model is missing", async (t) => {
  await withSeededConsoleStore(
    t,
    {
      provider: {
        id: "default",
        type: "open-responses",
        apiKey: "test-api-key",
      },
      model: {
        id: "default",
        providerId: "default",
        name: "${}",
      },
    },
    async (store) => {
      await assert.rejects(
        () => createModel({ config: createAgentConfig("default"), store }),
        /No LLM model name configured/i,
      );
    },
  );
});

test("createModel: throws when api key is missing and env fallback is empty", async (t) => {
  const oldAnthropic = process.env.ANTHROPIC_API_KEY;
  const oldOpenAI = process.env.OPENAI_API_KEY;
  const oldGeneric = process.env.API_KEY;

  process.env.ANTHROPIC_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  process.env.API_KEY = "";

  try {
    await withSeededConsoleStore(
      t,
      {
        provider: {
          id: "default",
          type: "open-responses",
        },
        model: {
          id: "default",
          providerId: "default",
          name: "gpt-5.2",
        },
      },
      async (store) => {
        await assert.rejects(
          () => createModel({ config: createAgentConfig("default"), store }),
          /No API Key configured/i,
        );
      },
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
