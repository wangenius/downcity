/**
 * ChatQueueStore 实例队列测试（node:test）。
 *
 * 关键点（中文）
 * - queue store 应该是实例级状态，而不是模块级全局状态。
 * - 不同 store 之间的 lane 和监听器不能串线。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ChatQueueStore } from "../../bin/services/chat@/city/runtime/console/ChatQueueStore.js";

test("ChatQueueStore keeps queue state isolated per instance", () => {
  const storeA = new ChatQueueStore();
  const storeB = new ChatQueueStore();

  const resultA = storeA.enqueue({
    kind: "exec",
    channel: "telegram",
    targetId: "chat-a",
    sessionId: "lane-a",
    text: "hello-a",
  });
  const resultB = storeB.enqueue({
    kind: "exec",
    channel: "telegram",
    targetId: "chat-b",
    sessionId: "lane-b",
    text: "hello-b",
  });

  assert.equal(resultA.lanePosition, 1);
  assert.equal(resultB.lanePosition, 1);
  assert.equal(storeA.getLaneSize("lane-a"), 1);
  assert.equal(storeA.getLaneSize("lane-b"), 0);
  assert.equal(storeB.getLaneSize("lane-a"), 0);
  assert.equal(storeB.getLaneSize("lane-b"), 1);
});

test("ChatQueueStore notifies only its own enqueue listeners", () => {
  const storeA = new ChatQueueStore();
  const storeB = new ChatQueueStore();
  const eventsA = [];
  const eventsB = [];

  storeA.onEnqueue((laneKey) => {
    eventsA.push(laneKey);
  });
  storeB.onEnqueue((laneKey) => {
    eventsB.push(laneKey);
  });

  storeA.enqueue({
    kind: "audit",
    channel: "telegram",
    targetId: "chat-a",
    sessionId: "lane-a",
    text: "audit-a",
  });

  assert.deepEqual(eventsA, ["lane-a"]);
  assert.deepEqual(eventsB, []);
});
