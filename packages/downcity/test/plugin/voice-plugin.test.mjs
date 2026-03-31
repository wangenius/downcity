/**
 * ASR Plugin Action 测试（node:test）。
 *
 * 关键点（中文）
 * - 验证新的 plugin action 管理面已经可直接使用。
 * - 重点覆盖 status / configure / install 三个第一阶段关键入口。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { asrPlugin } from "../../bin/plugins/asr/Plugin.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    log() {},
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
      },
    },
  };
}

test("asr plugin configure action writes plugin config", async () => {
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
});

test("asr plugin install action no longer depends on runtime.assets", async () => {
  const { runtime } = createRuntime();

  const result = await asrPlugin.actions.install.execute({
    context: runtime,
    payload: {
      force: true,
    },
    pluginName: "asr",
    actionName: "install",
  });

  assert.equal(result.success, true);
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
