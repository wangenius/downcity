/**
 * ASR Plugin Action 测试（node:test）。
 *
 * 关键点（中文）
 * - `voice` 插件已重命名为 `asr`。
 * - 配置应写入 `plugins.asr`，不再写入 `plugins.voice`。
 * - 内建 plugin 清单与 CLI 注册也应暴露 `asr`，不再暴露 `voice`。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Command } from "commander";
import { asrPlugin } from "../../bin/plugins/asr/Plugin.js";
import { PLUGINS } from "../../bin/main/plugin/Plugins.js";
import { registerAllPluginsForCli } from "../../bin/main/plugin/PluginCommand.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    log() {},
  };
}

function createHost(rootPath) {
  return {
    globalEnv: {},
    paths: {
      projectRoot: rootPath,
      getDowncityDirPath: () => path.join(rootPath, ".downcity"),
      getCacheDirPath: () => path.join(rootPath, ".downcity", ".cache"),
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity", "channel"),
      getDowncityChannelMetaPath: () => path.join(rootPath, ".downcity", "channel", "meta.json"),
      getDowncityChatHistoryPath: (sessionId) =>
        path.join(rootPath, ".downcity", "chat", sessionId, "history.jsonl"),
      getDowncityMemoryIndexPath: () => path.join(rootPath, ".downcity", "memory", "index.sqlite"),
      getDowncityMemoryLongTermPath: () => path.join(rootPath, ".downcity", "memory", "MEMORY.md"),
      getDowncityMemoryDailyDirPath: () => path.join(rootPath, ".downcity", "memory", "daily"),
      getDowncityMemoryDailyPath: (date) =>
        path.join(rootPath, ".downcity", "memory", "daily", `${date}.md`),
      getDowncitySessionRootDirPath: () => path.join(rootPath, ".downcity", "session"),
      getDowncitySessionDirPath: (sessionId) =>
        path.join(rootPath, ".downcity", "session", sessionId),
    },
    auth: {
      applyInternalAgentAuthEnv() {},
    },
    pluginConfig: {
      async persistProjectPlugins() {
        return path.join(rootPath, "downcity.json");
      },
    },
  };
}

function createRuntime() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-asr-plugin-"));
  fs.writeFileSync(
    path.join(rootPath, "downcity.json"),
    `${JSON.stringify({
      name: "demo",
      version: "1.0.0",
      model: {
        primary: "demo-model",
      },
    }, null, 2)}\n`,
    "utf-8",
  );
  return {
    runtime: {
      cwd: ".",
      rootPath,
      logger: createLogger(),
      config: {
        name: "demo",
        version: "1.0.0",
        model: {
          primary: "demo-model",
        },
        plugins: {
          asr: {
            provider: "command",
            command: "printf 'ok\\n'",
          },
        },
      },
      env: {},
      ...createHost(rootPath),
      systems: [],
      context: {},
      services: {
        async invoke() {
          return { success: false, error: "unused" };
        },
      },
      plugins: {
        list() {
          return [];
        },
        async availability() {
          return {
            enabled: true,
            available: true,
            reasons: [],
          };
        },
        async runAction() {
          return {
            success: false,
            error: "unused",
            message: "unused",
          };
        },
        async pipeline(_pointName, value) {
          return value;
        },
        async guard() {},
        async effect() {},
        async resolve() {
          return {};
        },
      },
    },
  };
}

test("asr plugin configure action writes plugin config into plugins.asr", async () => {
  const { runtime } = createRuntime();

  const result = await asrPlugin.actions.configure.execute({
    context: runtime,
    payload: {
      enabled: true,
      injectPrompt: false,
    },
    pluginName: "asr",
    actionName: "configure",
  });

  assert.equal(result.success, true);
  assert.equal(runtime.config.plugins.asr.enabled, true);
  assert.equal(runtime.config.plugins.asr.injectPrompt, false);
  assert.equal(runtime.config.plugins.voice, undefined);
});

test("asr plugin status action returns plugin and transcriber snapshots", async () => {
  const { runtime } = createRuntime();

  await asrPlugin.actions.configure.execute({
    context: runtime,
    payload: {
      enabled: true,
    },
    pluginName: "asr",
    actionName: "configure",
  });

  const result = await asrPlugin.actions.status.execute({
    context: runtime,
    payload: {},
    pluginName: "asr",
    actionName: "status",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.plugin.enabled, true);
  assert.equal(result.data.transcriber.provider, "command");
});

test("builtin plugins and CLI expose asr instead of voice", () => {
  const pluginNames = PLUGINS.map((plugin) => plugin.name).sort();
  assert.equal(pluginNames.includes("asr"), true);
  assert.equal(pluginNames.includes("voice"), false);

  const program = new Command();
  registerAllPluginsForCli(program);
  const commandNames = program.commands.map((command) => command.name()).sort();
  assert.equal(commandNames.includes("asr"), true);
  assert.equal(commandNames.includes("voice"), false);
});
