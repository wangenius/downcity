/**
 * @file 验证 ImagePlugin 对 Agent 保持直接生图体验。
 *
 * 关键点（中文）
 * - Agent 只调用 `generate` action。
 * - 插件内部直接调用注入的 image 函数。
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

test("ImagePlugin generate calls image and returns the generated message", async () => {
  const calls = [];
  const plugin = new ImagePlugin({
    image: (input) => {
      calls.push(["image", input.prompt]);
      return create_image_message();
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
  assert.deepEqual(calls, [["image", "draw"]]);
});

test("ImagePlugin generate reports image failure", async () => {
  const plugin = new ImagePlugin({
    image: () => {
      throw new Error("provider failed");
    },
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
