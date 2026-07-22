/**
 * @file 验证 canonical Tool Part Gate 按 Tool Call 独立协调等待与释放。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SessionToolPartGate } from "../bin/session/messages/SessionToolPartGate.js";

test("不同 Tool Call 独立释放，不形成全局执行锁", async () => {
  const gate = new SessionToolPartGate();
  let tool_a_ready = false;
  let tool_b_ready = false;
  const tool_a = gate.wait_until_available("call-a").then(() => {
    tool_a_ready = true;
  });
  const tool_b = gate.wait_until_available("call-b").then(() => {
    tool_b_ready = true;
  });

  gate.mark_available("call-a");
  await tool_a;
  assert.equal(tool_a_ready, true);
  assert.equal(tool_b_ready, false);

  gate.mark_available("call-b");
  await tool_b;
  assert.equal(tool_b_ready, true);
  await gate.wait_until_available("call-a");
});

test("reject_pending 只清理当前等待，Gate 可用于后续 step", async () => {
  const gate = new SessionToolPartGate();
  const aborted = assert.rejects(
    gate.wait_until_available("call-aborted"),
    /step aborted: call-aborted/,
  );
  gate.reject_pending("step aborted");
  await aborted;

  const next_step = gate.wait_until_available("call-next");
  gate.mark_available("call-next");
  await next_step;
});

test("close 拒绝当前及后续 Tool Part 等待", async () => {
  const gate = new SessionToolPartGate();
  const pending = assert.rejects(
    gate.wait_until_available("call-pending"),
    /writer closed: call-pending/,
  );
  gate.close("writer closed");
  await pending;
  await assert.rejects(
    gate.wait_until_available("call-future"),
    /writer closed/,
  );
});
