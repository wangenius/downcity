/**
 * CLI Agent 全局配置与 Chat 装配行为测试。
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function create_temp_root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "downcity-config-storage-"));
}

test("Agent 配置只从全局 DB 读取", async () => {
  const platform_root = create_temp_root();
  const project_root = create_temp_root();
  process.env.DC_PLATFORM_ROOT = platform_root;
  try {
    fs.writeFileSync(path.join(project_root, "downcity.json"), JSON.stringify({
      id: "legacy_agent",
      version: "1.0.0",
    }));
    const store = await import("../bin/city/process/registry/AgentConfigStore.js");
    assert.equal(store.readAgentConfig(project_root), null);

    store.upsertAgentConfig({
      projectRoot: project_root,
      id: "db_agent",
      version: "1.0.0",
    });
    assert.equal(store.readAgentConfig(project_root).id, "db_agent");
    assert.equal(fs.existsSync(path.join(platform_root, "downcity.db")), true);
  } finally {
    fs.rmSync(platform_root, { recursive: true, force: true });
    fs.rmSync(project_root, { recursive: true, force: true });
  }
});

test("Chat 装配严格使用当前 Agent 绑定与 queue 配置", async () => {
  const { createCityStaticBuiltinPlugins } = await import(
    "../bin/city/runtime/plugins/CityBuiltinPlugins.js"
  );
  const plugins = createCityStaticBuiltinPlugins({
    config: {
      id: "agent_test",
      version: "1.0.0",
      plugins: {
        chat: {
          queue: { maxConcurrency: 5 },
          channels: {
            telegram: {
              enabled: true,
              channelAccountId: "telegram_bound",
            },
          },
        },
      },
    },
  });
  const chat = plugins.find((plugin) => plugin.name === "chat");
  assert.ok(chat);
  assert.equal(chat.getChannelAccountId({}, "telegram"), "telegram_bound");
  assert.equal(chat.isChannelEnabled({}, "telegram"), true);
  assert.equal(chat.isChannelEnabled({}, "feishu"), false);
  assert.deepEqual(chat.getQueueWorkerConfig({}), { maxConcurrency: 5 });

  const unbound = createCityStaticBuiltinPlugins().find((plugin) => plugin.name === "chat");
  assert.equal(unbound.isChannelEnabled({}, "telegram"), false);
  assert.equal(unbound.getChannelAccountId({}, "telegram"), "");
});
