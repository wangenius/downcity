/**
 * @file 验证 CityModel 上下文窗口元数据与 compact 的明确触发语义。
 *
 * 关键点（中文）
 * - CityModel 目录元数据需要在归一化前读取。
 * - compact 不再根据字符/token 预估自动触发。
 * - 只有明确 force 或超限恢复才会调用 history store。
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
    force: true,
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

test("compact input carries only an explicit force request", async () => {
  const compact_input = await capture_compact_input({ context_window: 256000 });
  assert.equal(compact_input.force, true);
  assert.equal("maxInputTokensApprox" in compact_input, false);
  assert.equal("compactRatio" in compact_input, false);
  assert.equal("keepLastMessages" in compact_input, false);
});

test("normal composer run does not call history store without force", async () => {
  let called = false;
  const composer = new JsonlSessionCompactionComposer();
  const result = await composer.run({
    historyStore: {
      compact: async () => {
        called = true;
        return { compacted: true };
      },
    },
    model: {},
    system: [],
    retryCount: 0,
  });
  assert.deepEqual(result, { compacted: false, reason: "not_requested" });
  assert.equal(called, false);
});
