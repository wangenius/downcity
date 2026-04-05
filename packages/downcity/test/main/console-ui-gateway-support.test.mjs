/**
 * Console UI gateway 辅助逻辑测试（node:test）。
 *
 * 关键点（中文）
 * - stop/restart 被 workload 阻塞时，应生成稳定且可读的错误文案。
 * - detail 为空时，也应返回通用阻塞提示。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsoleWorkloadBlockPayload,
} from "../../bin/main/modules/console/gateway/GatewaySupport.js";

test("buildConsoleWorkloadBlockPayload includes contexts and tasks in detail", () => {
  const payload = buildConsoleWorkloadBlockPayload("restart", {
    activeContexts: ["ctx_chat_1", "ctx_chat_2"],
    activeTasks: ["task_alpha"],
  });

  assert.equal(payload.success, false);
  assert.match(payload.error, /restart blocked/);
  assert.match(payload.error, /contexts: ctx_chat_1, ctx_chat_2/);
  assert.match(payload.error, /tasks: task_alpha/);
});

test("buildConsoleWorkloadBlockPayload falls back to generic message when detail is empty", () => {
  const payload = buildConsoleWorkloadBlockPayload("stop", {
    activeContexts: [],
    activeTasks: [],
  });

  assert.equal(payload.success, false);
  assert.equal(payload.error, "Agent has running workload, stop blocked");
});
