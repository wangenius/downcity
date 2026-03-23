/**
 * Voice Plugin Action 测试（node:test）。
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
import { voicePlugin } from "../../bin/plugins/voice/Plugin.js";

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
  const assetInstalls = [];
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-voice-plugin-"));
  fs.writeFileSync(
    path.join(rootPath, "ship.json"),
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
    assetInstalls,
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
        plugins: {},
        assets: {},
      },
      env: {},
      systems: [],
      context: {},
      services: {
        async invoke() {
          return { success: false, error: "unused" };
        },
      },
      assets: {
        list() {
          return [];
        },
        async check() {
          return {
            available: true,
            reasons: [],
          };
        },
        async install(assetName, payload) {
          assetInstalls.push({
            assetName,
            payload,
          });
          return {
            success: true,
            message: "installed",
            details: {
              assetName,
            },
          };
        },
        async use() {
          return {
            async transcribe() {
              return {
                success: true,
                text: "ok",
              };
            },
          };
        },
        async getConfig() {
          return {
            provider: "local",
          };
        },
        async setConfig() {
          return {};
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
            missingAssets: [],
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

test("voice plugin configure action writes plugin config", async () => {
  const { runtime } = createRuntime();

  const result = await voicePlugin.actions.configure.execute({
    runtime,
    payload: {
      enabled: true,
      injectPrompt: false,
    },
    pluginName: "voice",
    actionName: "configure",
  });

  assert.equal(result.success, true);
  assert.equal(runtime.config.plugins.voice.enabled, true);
  assert.equal(runtime.config.plugins.voice.injectPrompt, false);
});

test("voice plugin install action delegates to voice.transcriber asset", async () => {
  const { runtime, assetInstalls } = createRuntime();

  const result = await voicePlugin.actions.install.execute({
    runtime,
    payload: {
      force: true,
    },
    pluginName: "voice",
    actionName: "install",
  });

  assert.equal(result.success, true);
  assert.equal(assetInstalls.length, 1);
  assert.equal(assetInstalls[0].assetName, "voice.transcriber");
  assert.equal(assetInstalls[0].payload.force, true);
});

test("voice plugin status action returns plugin and asset snapshots", async () => {
  const { runtime } = createRuntime();

  await voicePlugin.actions.configure.execute({
    runtime,
    payload: {
      enabled: true,
    },
    pluginName: "voice",
    actionName: "configure",
  });

  const result = await voicePlugin.actions.status.execute({
    runtime,
    payload: {},
    pluginName: "voice",
    actionName: "status",
  });

  assert.equal(result.success, true);
  assert.equal(result.data.plugin.enabled, true);
  assert.equal(result.data.availability.available, true);
  assert.equal(result.data.asset.provider, "local");
});
