/**
 * Chat channel 配置持久化公开行为测试。
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ChatPlugin } from "../bin/index.js";

function create_channel(name) {
  let enabled = false;
  let channel_account_id = "";
  return {
    name,
    isEnabled: () => enabled,
    getChannelAccountId: () => channel_account_id,
    getAccount: () => null,
    applyRuntimePatch: (patch) => {
      if (typeof patch.enabled === "boolean") enabled = patch.enabled;
      if (Object.prototype.hasOwnProperty.call(patch, "channelAccountId")) {
        channel_account_id = String(patch.channelAccountId || "").trim();
      }
    },
  };
}

function create_context(plugin) {
  const writes = [];
  const context = {
    config: {
      id: "agent_test",
      version: "1.0.0",
      plugins: { memory: { enabled: true } },
    },
    pluginInstances: new Map([["chat", plugin]]),
    pluginConfig: {
      persistProjectPlugins: async (plugins) => {
        writes.push(structuredClone(plugins));
        return "/tmp/agent_test";
      },
    },
  };
  return { context, writes };
}

async function execute(plugin, action_name, context, input) {
  return await plugin.actions[action_name].execute({
    context,
    input,
    pluginName: "chat",
    actionName: action_name,
  });
}

test("chat.open/close/configure 持久化完整 plugins 配置", async () => {
  const telegram = create_channel("telegram");
  const plugin = new ChatPlugin({ channels: [telegram] });
  const { context, writes } = create_context(plugin);

  await execute(plugin, "open", context, { channel: "telegram" });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].memory.enabled, true);
  assert.equal(writes[0].chat.channels.telegram.enabled, true);
  assert.equal(plugin.isChannelEnabled(context, "telegram"), true);

  await execute(plugin, "configure", context, {
    channel: "telegram",
    config: { enabled: false },
    restart: false,
  });
  assert.equal(writes.length, 2);
  assert.equal(writes[1].chat.channels.telegram.enabled, false);
  assert.equal(plugin.isChannelEnabled(context, "telegram"), false);

  await execute(plugin, "close", context, { channel: "telegram" });
  assert.equal(writes.length, 3);
  assert.equal(context.config.plugins.chat.channels.telegram.enabled, false);
});

test("ChatPlugin queue 只读取 constructor 配置", () => {
  const queue = { maxConcurrency: 7, mergeDebounceMs: 123 };
  const plugin = new ChatPlugin({ queue, channels: [] });
  assert.deepEqual(plugin.getQueueWorkerConfig({}), queue);
});
