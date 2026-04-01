/**
 * TTS Plugin 测试（node:test）。
 *
 * 关键点（中文）
 * - TTS 现在走本地模型目录与安装配置流，不再依赖 console 模型池。
 * - 优先保证 setup / models / install 这些管理动作行为稳定。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ttsPlugin } from "../../bin/plugins/tts/Plugin.js";
import { resolveDefaultTtsVenvPythonBin } from "../../bin/plugins/tts/runtime/DependencyInstaller.js";

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
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-tts-plugin-"));
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
    rootPath,
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
          tts: {
            enabled: false,
            format: "wav",
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
        async resolve() {
          return {};
        },
      },
    },
  };
}

test("tts plugin models action exposes default local model catalog", async () => {
  const { runtime } = createRuntime();

  const result = await ttsPlugin.actions.models.execute({
    context: runtime,
    payload: {},
    pluginName: "tts",
    actionName: "models",
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    result.data.options.map((item) => item.value),
    [
      "qwen3-tts-0.6b",
      "kokoro-82m",
      "qwen3-tts-1.7b",
    ],
  );
});

test("tts plugin install action writes local model config when model already exists", async () => {
  const { runtime, rootPath } = createRuntime();
  const modelsDir = path.join(rootPath, ".models", "tts");
  const modelDir = path.join(modelsDir, "qwen3-tts-0.6b");
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(
    path.join(modelDir, "downcity.tts.install.json"),
    JSON.stringify({
      modelId: "qwen3-tts-0.6b",
      repoId: "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    }, null, 2),
    "utf-8",
  );

  const result = await ttsPlugin.actions.install.execute({
    context: runtime,
    payload: {
      modelIds: ["qwen3-tts-0.6b"],
      activeModel: "qwen3-tts-0.6b",
      modelsDir,
      installDeps: false,
    },
    pluginName: "tts",
    actionName: "install",
  });

  assert.equal(result.success, true);
  assert.equal(runtime.config.plugins.tts.enabled, true);
  assert.equal(runtime.config.plugins.tts.modelId, "qwen3-tts-0.6b");
  assert.equal(runtime.config.plugins.tts.modelsDir, modelsDir);
  assert.equal(runtime.config.plugins.tts.pythonBin, resolveDefaultTtsVenvPythonBin());
  assert.deepEqual(runtime.config.plugins.tts.installedModels, ["qwen3-tts-0.6b"]);
  assert.equal(Array.isArray(result.data.logs), true);
  assert.equal(result.data.logs.length > 0, true);
});
