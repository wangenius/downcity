/**
 * @file 验证 CityModel 上下文窗口会驱动默认 session compact 预算。
 *
 * 关键点（中文）
 * - CityModel 目录元数据需要在归一化前读取。
 * - 默认 compact 使用模型总窗口的 80%，并随重试次数收紧。
 * - 显式 maxInputTokensApprox 始终优先于模型目录配置。
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  JsonlSessionCompactionComposer,
  read_agent_model_context_window,
} from "../bin/index.js";
import {
  CITY_MODEL_INVOKER,
  CITY_MODEL_KIND,
} from "@downcity/type";

/** 创建仅用于读取公开目录元数据的 CityModel。 */
function create_city_model(context_window) {
  return {
    id: "context-model",
    name: "Context Model",
    description: "Context window test model",
    context_window,
    modalities: ["text"],
    tags: [],
    meta: {},
    kind: CITY_MODEL_KIND,
    [CITY_MODEL_INVOKER]: {
      connection: () => ({
        base_url: "https://example.com/v1/ai",
        model_id: "context-model",
      }),
    },
  };
}

/** 执行一次策略并返回传给 history store 的 compact 参数。 */
async function capture_compact_input(options = {}) {
  let compact_input;
  const composer = new JsonlSessionCompactionComposer(options.composer_options);
  await composer.run({
    historyStore: {
      compact: async (input) => {
        compact_input = input;
        return { compacted: false, reason: "captured" };
      },
    },
    model: {},
    system: [],
    retryCount: options.retry_count ?? 0,
    ...(options.context_window !== undefined
      ? { context_window: options.context_window }
      : {}),
  });
  assert.ok(compact_input);
  return compact_input;
}

test("CityModel exposes its configured context window to Agent", () => {
  assert.equal(
    read_agent_model_context_window(create_city_model(256000)),
    256000,
  );
})

test("default compact budget uses 80 percent of the model context window", async () => {
  const first_attempt = await capture_compact_input({
    context_window: 256000,
  });
  assert.equal(first_attempt.maxInputTokensApprox, 204800);

  const retry = await capture_compact_input({
    context_window: 256000,
    retry_count: 1,
  });
  assert.equal(retry.maxInputTokensApprox, 102400);
})

test("explicit compact budget overrides the model context window", async () => {
  const compact_input = await capture_compact_input({
    context_window: 256000,
    composer_options: { maxInputTokensApprox: 64000 },
  });
  assert.equal(compact_input.maxInputTokensApprox, 64000);
})

test("compact keeps the existing 128k fallback without model metadata", async () => {
  const compact_input = await capture_compact_input();
  assert.equal(compact_input.maxInputTokensApprox, 128000);
})
