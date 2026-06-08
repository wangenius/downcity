/**
 * @file 验证 ImagePlugin 对 Agent 保持直接生图体验。
 *
 * 关键点（中文）
 * - Agent 只调用 `generate` action。
 * - 插件内部调用注入的 image_create / image_result 任务函数并轮询。
 * - 成功后返回 UIMessage，后续由 plugin bridge 落盘 file parts。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ImagePlugin } from "../bin/index.js";

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
