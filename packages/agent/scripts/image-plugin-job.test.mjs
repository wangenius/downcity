/**
 * @file 验证 ImagePlugin 对 Agent 保持直接生图体验。
 *
 * 关键点（中文）
 * - 插件暴露 image_create / image_result 两个任务 action，并保留 generate 便捷 action。
 * - image_result 默认轮询到终态，成功后返回 UIMessage 方便 tool bridge 自动挂载图片。
 * - 成功后返回 UIMessage，后续由 plugin bridge 落盘 file parts。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ImagePlugin } from "../../plugins/bin/index.js";

function create_image_message() {
  return {
    id: "msg_image_test",
    role: "assistant",
    parts: [
      {
        type: "file",
        mediaType: "image/png",
        filename: "image.png",
        url: "data:image/png;base64,cG5n",
      },
    ],
  };
}

test("ImagePlugin generate creates and polls image jobs", async () => {
  const calls = [];
  const message = create_image_message();
  const plugin = new ImagePlugin({
    min_poll_interval_ms: 1,
    image_create: (input) => {
      calls.push(["create", input.prompt]);
      return { job_id: "img_1", status: "queued", poll_after_ms: 1 };
    },
    image_result: (input) => {
      calls.push(["result", input.job_id]);
      return calls.length === 2
        ? { job_id: input.job_id, status: "running", poll_after_ms: 1 }
        : { job_id: input.job_id, status: "succeeded", result: message, poll_after_ms: 1 };
    },
  });

  const result = await plugin.actions.generate.execute({
    context: {},
    payload: { prompt: "draw" },
    pluginName: "image",
    actionName: "generate",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.role, "assistant");
  assert.equal(result.data.parts[0].type, "file");
  assert.deepEqual(calls, [
    ["create", "draw"],
    ["result", "img_1"],
    ["result", "img_1"],
  ]);
});

test("ImagePlugin image_create returns image job", async () => {
  const plugin = new ImagePlugin({
    image_create: (input) => ({
      job_id: "img_1",
      status: "queued",
      poll_after_ms: 1,
      metadata: { prompt: input.prompt },
    }),
    image_result: () => ({ job_id: "img_1", status: "queued", poll_after_ms: 1 }),
  });

  const result = await plugin.actions.image_create.execute({
    context: {},
    payload: { prompt: "draw" },
    pluginName: "image",
    actionName: "image_create",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.job_id, "img_1");
  assert.equal(result.data.status, "queued");
});

test("ImagePlugin models lists image-capable models", async () => {
  const plugin = new ImagePlugin({
    list_models: () => [
      {
        id: "text_1",
        name: "Text",
        description: "text only",
        modalities: ["text"],
        tags: ["general"],
        meta: {},
      },
      {
        id: "image_1",
        name: "Image",
        description: "image model",
        modalities: ["image"],
        tags: ["creative"],
        meta: { provider: "test" },
        default_modalities: ["image"],
      },
    ],
    image_create: () => ({ job_id: "img_1", status: "queued", poll_after_ms: 1 }),
    image_result: () => ({ job_id: "img_1", status: "queued", poll_after_ms: 1 }),
  });

  const result = await plugin.actions.models.execute({
    context: {},
    payload: {},
    pluginName: "image",
    actionName: "models",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.default_model_id, "image_1");
  assert.deepEqual(result.data.items.map((item) => item.id), ["image_1"]);
  assert.equal(result.data.items[0].meta.provider, "test");
});

test("ImagePlugin image_result waits by default and returns final message", async () => {
  const calls = [];
  const message = create_image_message();
  const plugin = new ImagePlugin({
    min_poll_interval_ms: 1,
    image_create: () => ({ job_id: "img_1", status: "queued", poll_after_ms: 1 }),
    image_result: (input) => {
      calls.push(input.job_id);
      return calls.length === 1
        ? { job_id: input.job_id, status: "running", poll_after_ms: 1 }
        : { job_id: input.job_id, status: "succeeded", result: message, poll_after_ms: 1 };
    },
  });

  const result = await plugin.actions.image_result.execute({
    context: {},
    payload: { job_id: "img_1" },
    pluginName: "image",
    actionName: "image_result",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.role, "assistant");
  assert.equal(result.data.parts[0].type, "file");
  assert.deepEqual(calls, ["img_1", "img_1"]);
});

test("ImagePlugin image_result can read once without waiting", async () => {
  const calls = [];
  const plugin = new ImagePlugin({
    min_poll_interval_ms: 1,
    image_create: () => ({ job_id: "img_1", status: "queued", poll_after_ms: 1 }),
    image_result: (input) => {
      calls.push(input.job_id);
      return { job_id: input.job_id, status: "running", poll_after_ms: 1 };
    },
  });

  const result = await plugin.actions.image_result.execute({
    context: {},
    payload: { job_id: "img_1", until_finish: false },
    pluginName: "image",
    actionName: "image_result",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.job_id, "img_1");
  assert.equal(result.data.status, "running");
  assert.deepEqual(calls, ["img_1"]);
});

test("ImagePlugin image_result reports failed terminal job by default", async () => {
  const plugin = new ImagePlugin({
    min_poll_interval_ms: 1,
    image_create: () => ({ job_id: "img_1", status: "queued", poll_after_ms: 1 }),
    image_result: (input) => ({
      job_id: input.job_id,
      status: "failed",
      error: "provider failed",
      poll_after_ms: 1,
    }),
  });

  const result = await plugin.actions.image_result.execute({
    context: {},
    payload: { job_id: "img_1" },
    pluginName: "image",
    actionName: "image_result",
  });

  assert.equal(result.success, false);
  assert.match(result.error, /provider failed/);
});

test("ImagePlugin generate reports image failure", async () => {
  const plugin = new ImagePlugin({
    min_poll_interval_ms: 1,
    image_create: () => ({ job_id: "img_1", status: "queued", poll_after_ms: 1 }),
    image_result: () => ({ job_id: "img_1", status: "failed", error: "provider failed", poll_after_ms: 1 }),
  });

  const result = await plugin.actions.generate.execute({
    context: {},
    payload: { prompt: "draw" },
    pluginName: "image",
    actionName: "generate",
  });

  assert.equal(result.success, false);
  assert.match(result.error, /provider failed/);
});
