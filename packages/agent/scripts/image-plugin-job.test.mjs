/**
 * @file 验证 ImagePlugin 对 Agent 保持直接生图体验。
 *
 * 关键点（中文）
 * - Agent 只调用 `generate` action。
 * - 插件内部负责 image_create/image_result 轮询。
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

test("ImagePlugin generate polls create/result until the image succeeds", async () => {
  const calls = [];
  const plugin = new ImagePlugin({
    create: (input) => {
      calls.push(["create", input.prompt]);
      return {
        job_id: "img_custom",
        status: "running",
        poll_after_ms: 1,
      };
    },
    result: () => {
      calls.push(["result"]);
      return calls.filter(([name]) => name === "result").length === 1
        ? {
            job_id: "img_custom",
            status: "running",
            poll_after_ms: 1,
          }
        : {
            job_id: "img_custom",
            status: "succeeded",
            result: create_image_message(),
          };
    },
    poll_interval_ms: 1,
    wait_timeout_ms: 100,
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
    ["result"],
    ["result"],
  ]);
});

test("ImagePlugin generate reports job failure", async () => {
  const plugin = new ImagePlugin({
    create: () => ({
      job_id: "img_failed",
      status: "running",
      poll_after_ms: 1,
    }),
    result: () => ({
      job_id: "img_failed",
      status: "failed",
      error: "provider failed",
    }),
    poll_interval_ms: 1,
    wait_timeout_ms: 100,
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
