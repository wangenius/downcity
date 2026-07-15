/**
 * Chat channel 构造配置公开行为测试。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ChatPlugin } from "../bin/index.js";

function create_channel(name) {
  return {
    name,
    isEnabled: () => false,
    getChannelAccountId: () => "",
    getAccount: () => null,
  };
}

test("ChatPlugin 配置只来自 constructor", () => {
  const telegram = create_channel("telegram");
  const queue = { maxConcurrency: 7, mergeDebounceMs: 123 };
  const plugin = new ChatPlugin({ queue, channels: [telegram] });

  assert.equal(plugin.channels[0], telegram);
  assert.deepEqual(plugin.getQueueWorkerConfig({}), queue);
});

test("ChatPlugin 不提供配置修改 action", () => {
  const plugin = new ChatPlugin({ channels: [] });

  assert.equal("open" in plugin.actions, false);
  assert.equal("close" in plugin.actions, false);
  assert.equal("configuration" in plugin.actions, false);
  assert.equal("configure" in plugin.actions, false);
});
