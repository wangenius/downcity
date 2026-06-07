/**
 * @file 验证 ImagePlugin 的可观察图片任务协议。
 *
 * 关键点（中文）
 * - `create` 应快速返回 job_id，而不是同步等待图片完成。
 * - `status/result` 可查询同一个任务，成功后 result 返回 UIMessage。
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

test("ImagePlugin create/status/result exposes async image jobs", async () => {
  let finish_image;
  const image_promise = new Promise((resolve) => {
    finish_image = () => resolve(create_image_message());
  });
  const plugin = new ImagePlugin({
    image: async () => image_promise,
    poll_interval_ms: 1,
    wait_timeout_ms: 100,
  });

  const created = await plugin.actions.create.execute({
    context: {},
    payload: { prompt: "draw" },
    pluginName: "image",
    actionName: "create",
  });

  assert.equal(created.success, true);
  assert.equal(created.data.status, "running");
  assert.match(created.data.job_id, /^img_/);

  const before = await plugin.actions.status.execute({
    context: {},
    payload: { job_id: created.data.job_id },
    pluginName: "image",
    actionName: "status",
  });

  assert.equal(before.success, true);
  assert.equal(before.data.status, "running");

  finish_image();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const after = await plugin.actions.status.execute({
    context: {},
    payload: { job_id: created.data.job_id },
    pluginName: "image",
    actionName: "status",
  });

  assert.equal(after.success, true);
  assert.equal(after.data.status, "succeeded");
  assert.equal("result" in after.data, false);

  const result = await plugin.actions.result.execute({
    context: {},
    payload: { job_id: created.data.job_id },
    pluginName: "image",
    actionName: "result",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.role, "assistant");
  assert.equal(result.data.parts[0].type, "file");
});

test("ImagePlugin accepts custom job API without synchronous image function", async () => {
  const message = create_image_message();
  const plugin = new ImagePlugin({
    create: () => ({
      job_id: "img_custom",
      status: "running",
      poll_after_ms: 1,
    }),
    status: () => ({
      job_id: "img_custom",
      status: "succeeded",
    }),
    result: () => ({
      job_id: "img_custom",
      status: "succeeded",
      result: message,
    }),
  });

  const created = await plugin.actions.create.execute({
    context: {},
    payload: { prompt: "draw" },
    pluginName: "image",
    actionName: "create",
  });

  assert.equal(created.success, true);
  assert.equal(created.data.job_id, "img_custom");

  const result = await plugin.actions.result.execute({
    context: {},
    payload: { job_id: "img_custom" },
    pluginName: "image",
    actionName: "result",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.parts[0].type, "file");
});

test("ImagePlugin strips accidental result data from custom status responses", async () => {
  const plugin = new ImagePlugin({
    create: () => ({
      job_id: "img_status_result",
      status: "succeeded",
    }),
    status: () => ({
      job_id: "img_status_result",
      status: "succeeded",
      result: create_image_message(),
    }),
    result: () => ({
      job_id: "img_status_result",
      status: "succeeded",
      result: create_image_message(),
    }),
  });

  const status = await plugin.actions.status.execute({
    context: {},
    payload: { job_id: "img_status_result" },
    pluginName: "image",
    actionName: "status",
  });

  assert.equal(status.success, true);
  assert.equal(status.data.status, "succeeded");
  assert.equal("result" in status.data, false);
});
