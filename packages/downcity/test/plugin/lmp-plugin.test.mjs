/**
 * LMP Plugin 测试（node:test）。
 *
 * 关键点（中文）
 * - local executor 的本地模型配置现在收敛到 `plugins.lmp`。
 * - 优先保证 `models / install / status` 这些管理动作可稳定工作。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { lmpPlugin } from "../../bin/plugins/lmp/Plugin.js";

process.env.DC_CONSOLE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-test-console-lmp-"));

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
    pluginConfig: {
      async persistProjectPlugins() {
        return path.join(rootPath, "downcity.json");
      },
    },
  };
}

function createRuntime() {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-lmp-plugin-"));
  fs.writeFileSync(
    path.join(rootPath, "downcity.json"),
    `${JSON.stringify({
      name: "demo",
      version: "1.0.0",
      execution: {
        type: "local",
      },
      plugins: {
        lmp: {
          provider: "llama",
          modelsDir: path.join(rootPath, ".models"),
          command: "llama-server",
          autoStart: true,
        },
      },
    }, null, 2)}\n`,
    "utf-8",
  );

  return {
    rootPath,
    runtime: {
      cwd: ".",
      rootPath,
      logger: createLogger(),
      config: {
        name: "demo",
        version: "1.0.0",
        execution: {
          type: "local",
        },
        plugins: {
          lmp: {
            provider: "llama",
            modelsDir: path.join(rootPath, ".models"),
            command: "llama-server",
            autoStart: true,
          },
        },
      },
      env: {},
      ...createHost(rootPath),
    },
  };
}

test("lmp plugin models action lists local gguf files", async () => {
  const { runtime, rootPath } = createRuntime();
  const modelsDir = path.join(rootPath, ".models");
  fs.mkdirSync(path.join(modelsDir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(modelsDir, "gemma-4-E4B-it.gguf"), "gguf", "utf-8");
  fs.writeFileSync(path.join(modelsDir, "nested", "phi.gguf"), "gguf", "utf-8");

  const result = await lmpPlugin.actions.models.execute({
    context: runtime,
    payload: {},
    pluginName: "lmp",
    actionName: "models",
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data.options.map((item) => item.value),
    ["gemma-4-E4B-it.gguf", "nested/phi.gguf"],
  );
});

test("lmp plugin install action activates existing local gguf model", async () => {
  const { runtime, rootPath } = createRuntime();
  const modelsDir = path.join(rootPath, ".models");
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.writeFileSync(path.join(modelsDir, "gemma-4-E4B-it.gguf"), "gguf", "utf-8");

  const result = await lmpPlugin.actions.install.execute({
    context: runtime,
    payload: {
      activeModel: "gemma-4-E4B-it.gguf",
      skipDownload: true,
    },
    pluginName: "lmp",
    actionName: "install",
  });

  assert.equal(result.success, true);
  assert.equal(runtime.config.plugins.lmp.model, "gemma-4-E4B-it.gguf");
  assert.equal(runtime.config.plugins.lmp.modelsDir, modelsDir);
  assert.deepEqual(runtime.config.plugins.lmp.installedModels, ["gemma-4-E4B-it.gguf"]);
  assert.equal(Array.isArray(result.data.logs), true);
});

test("lmp plugin status action returns plugin snapshot", async () => {
  const { runtime, rootPath } = createRuntime();
  const modelsDir = path.join(rootPath, ".models");
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.writeFileSync(path.join(modelsDir, "gemma-4-E4B-it.gguf"), "gguf", "utf-8");
  runtime.config.plugins.lmp.model = "gemma-4-E4B-it.gguf";

  const result = await lmpPlugin.actions.status.execute({
    context: runtime,
    payload: {},
    pluginName: "lmp",
    actionName: "status",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.plugin.model, "gemma-4-E4B-it.gguf");
  assert.equal(typeof result.data.doctor, "object");
  assert.equal(typeof result.data.runtime, "object");
});
