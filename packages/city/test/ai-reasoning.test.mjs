/**
 * AIService 推理强度协议测试。
 *
 * 覆盖模型注册、目录公开、fallback 后解析、Provider 转换和 OpenAI-compatible 请求体。
 */

import assert from "node:assert/strict"
import test from "node:test"
import { MockLanguageModelV3 } from "ai/test"

import {
  AIService,
  Provider,
  read_resolved_reasoning,
} from "../bin/index.js"

/** 创建直接执行 AIService action 所需的最小 Context。 */
function create_context(input, env = () => undefined) {
  return {
    input: { ...input },
    locals: {},
    db: {},
    env,
  }
}

/** 返回可用于断言的固定 UIMessage。 */
function create_message(metadata = {}) {
  return {
    id: "msg_reasoning",
    role: "assistant",
    parts: [{ type: "text", text: "ok", state: "done" }],
    metadata,
  }
}

test("AIService validates reasoning configuration during model registration", () => {
  const ai = new AIService()

  assert.throws(() => ai.use({
    id: "invalid-reasoning",
    name: "Invalid Reasoning",
    reasoning: {
      efforts: [
        { id: "high", name: "High" },
        { id: "high", name: "Duplicate" },
      ],
      default_effort: "medium",
    },
    actions: { text: async () => create_message() },
  }), /duplicate reasoning effort: high/)

  assert.throws(() => new AIService().use({
    id: "invalid-default",
    name: "Invalid Default",
    reasoning: {
      efforts: [{ id: "high", name: "High" }],
      default_effort: "medium",
    },
    actions: { text: async () => create_message() },
  }), /unknown default reasoning effort: medium/)

  assert.throws(() => new AIService().use({
    id: "empty-default",
    name: "Empty Default",
    reasoning: {
      efforts: [{ id: "high", name: "High" }],
      default_effort: "",
    },
    actions: { text: async () => create_message() },
  }), /default reasoning effort must not be empty/)
})

test("AIService exposes reasoning capability and resolves request or default effort", async () => {
  const ai = new AIService()
  ai.use({
    id: "reasoning-model",
    name: "Reasoning Model",
    reasoning: {
      efforts: [
        { id: "low", name: "Low" },
        { id: "high", name: "High", description: "Deep reasoning" },
      ],
      default_effort: "low",
    },
    actions: {
      text: async (ctx) => create_message({
        reasoning: read_resolved_reasoning(ctx),
        input_effort: ctx.input.reasoning_effort,
        metering: ctx.metering?.metadata,
      }),
    },
  })

  const catalog = AIService.listModels(ai, {
    env: () => undefined,
    identity: "user",
  })
  assert.deepEqual(catalog[0].reasoning, {
    efforts: [
      { id: "low", name: "Low" },
      { id: "high", name: "High", description: "Deep reasoning" },
    ],
    default_effort: "low",
  })

  const action = ai.get("text")
  assert.ok(action)

  const explicit = await action.run(create_context({
    model: "reasoning-model",
    prompt: "hello",
    reasoning_effort: "high",
  }))
  assert.deepEqual(explicit.metadata.reasoning, { effort: "high", source: "request" })
  assert.equal(explicit.metadata.input_effort, "high")
  assert.equal(explicit.metadata.metering.reasoning_effort, "high")

  const fallback_default = await action.run(create_context({
    model: "reasoning-model",
    prompt: "hello",
  }))
  assert.deepEqual(fallback_default.metadata.reasoning, { effort: "low", source: "default" })
  assert.equal(fallback_default.metadata.input_effort, "low")
})

test("AIService rejects unsupported reasoning input against the final fallback model", async () => {
  const ai = new AIService()
  ai.use({
    id: "media-model",
    name: "Media Model",
    reasoning: { efforts: [{ id: "low", name: "Low" }] },
    actions: { text: async () => create_message() },
  })
  ai.use({
    id: "source-model",
    name: "Source Model",
    reasoning: { efforts: [{ id: "high", name: "High" }] },
    fallback: [{
      match: (media) => media.media_type.startsWith("image/"),
      model: "media-model",
    }],
    actions: { text: async () => create_message() },
  })

  const action = ai.get("text")
  assert.ok(action)
  await assert.rejects(() => action.run(create_context({
    model: "source-model",
    reasoning_effort: "high",
    messages: [{
      id: "user_1",
      role: "user",
      parts: [{ type: "file", mediaType: "image/png", url: "https://example.com/a.png" }],
    }],
  })), /Model media-model does not support reasoning_effort: high/)
})

test("AIService rejects reasoning for unsupported models and rejects effort_id aliases", async () => {
  const ai = new AIService()
  ai.use({
    id: "plain-model",
    name: "Plain Model",
    actions: { text: async () => create_message() },
  })

  const action = ai.get("text")
  assert.ok(action)
  await assert.rejects(() => action.run(create_context({
    model: "plain-model",
    reasoning_effort: "high",
  })), /Model plain-model does not support reasoning_effort/)
  await assert.rejects(() => action.run(create_context({
    model: "plain-model",
    effort_id: "high",
  })), /effort_id is not supported; use reasoning_effort/)
})

test("Provider converts resolved effort to AI SDK providerOptions", async () => {
  class OpenAIReasoningProvider extends Provider {
    async text(ctx) {
      const provider_options = this.build_reasoning_provider_options(ctx, {
        provider: "openai.chat",
      })
      return create_message({ provider_options })
    }
  }

  const provider = new OpenAIReasoningProvider({ id: "openai" })
  const ai = new AIService()
  ai.use(provider.model({
    id: "gpt-reasoning",
    name: "GPT Reasoning",
    reasoning: { efforts: [{ id: "high", name: "High" }] },
  }))

  const action = ai.get("text")
  assert.ok(action)
  const output = await action.run(create_context({
    model: "gpt-reasoning",
    prompt: "hello",
    reasoning_effort: "high",
  }))
  assert.deepEqual(output.metadata.provider_options, {
    openai: { reasoningEffort: "high" },
  })
})

test("Provider default text action passes reasoning providerOptions into AI SDK", async () => {
  let received_provider_options
  const language_model = new MockLanguageModelV3({
    provider: "openai.chat",
    modelId: "gpt-reasoning",
    doGenerate: async (options) => {
      received_provider_options = options.providerOptions
      return {
        content: [{ type: "text", text: "ok" }],
        finishReason: "stop",
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      }
    },
  })

  class DefaultTextProvider extends Provider {
    constructor() {
      super({
        id: "openai",
        envKey: "OPENAI_API_KEY",
        passthroughModel: "gpt-reasoning",
      })
    }

    createClient() {
      return { chat: () => language_model }
    }
  }

  const ai = new AIService()
  const provider = new DefaultTextProvider()
  ai.use(provider.model({
    id: "gpt-reasoning",
    name: "GPT Reasoning",
    reasoning: { efforts: [{ id: "high", name: "High" }] },
  }))

  const action = ai.get("text")
  assert.ok(action)
  const output = await action.run(create_context({
    model: "gpt-reasoning",
    prompt: "hello",
    reasoning_effort: "high",
  }, (key) => key === "OPENAI_API_KEY" ? "test-key" : undefined))

  assert.equal(output.parts[0].text, "ok")
  assert.deepEqual(received_provider_options, {
    openai: { reasoningEffort: "high" },
  })
})

test("OpenAI-compatible action receives the validated default reasoning_effort", async () => {
  const ai = new AIService()
  ai.use({
    id: "openai-route-model",
    name: "OpenAI Route Model",
    reasoning: {
      efforts: [{ id: "high", name: "High" }],
      default_effort: "high",
    },
    actions: {
      openai: async (ctx) => new Response(JSON.stringify(ctx.input), {
        headers: { "content-type": "application/json" },
      }),
    },
  })

  const action = ai.get("chat/completions")
  assert.ok(action)
  const response = await action.run(create_context({
    model: "openai-route-model",
    messages: [{ role: "user", content: "hello" }],
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    model: "openai-route-model",
    messages: [{ role: "user", content: "hello" }],
    reasoning_effort: "high",
  })
})
