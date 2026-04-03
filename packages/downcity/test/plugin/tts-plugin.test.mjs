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
import { synthesizeSpeechFile } from "../../bin/plugins/tts/runtime/Synthesizer.js";

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

test("tts plugin system prompt is injected only when plugin is enabled", async () => {
  const { runtime } = createRuntime();

  assert.equal(await ttsPlugin.system(runtime), "");

  runtime.config.plugins.tts.enabled = true;
  const prompt = await ttsPlugin.system(runtime);
  assert.match(prompt, /# TTS Plugin/);
  assert.match(prompt, /tts\.synthesize/);
  assert.match(prompt, /<file type="audio">/);
});

test("tts synthesize ignores known qwen warnings from stderr when output file exists", async () => {
  const { runtime, rootPath } = createRuntime();
  const fakePythonBin = path.join(rootPath, "fake-python.mjs");
  const modelsDir = path.join(rootPath, ".models", "tts");
  const modelDir = path.join(modelsDir, "qwen3-tts-0.6b");
  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(
    fakePythonBin,
    [
      "#!/usr/bin/env node",
      "import fs from 'node:fs';",
      "const outputPath = process.argv[8];",
      "process.stderr.write('Setting `pad_token_id` to `eos_token_id`:2150 for open-end generation.\\n');",
      "fs.writeFileSync(outputPath, 'RIFFfakewav');",
      "process.stdout.write(`${outputPath}\\n`);",
    ].join("\n"),
    "utf-8",
  );
  fs.chmodSync(fakePythonBin, 0o755);

  const result = await synthesizeSpeechFile({
    context: runtime,
    config: {
      enabled: true,
      format: "wav",
      modelId: "qwen3-tts-0.6b",
      modelsDir,
      pythonBin: fakePythonBin,
    },
    input: {
      text: "你好，欢迎来到 Downcity",
      output: ".downcity/out/warning-ok.wav",
    },
  });

  assert.equal(result.outputPath, ".downcity/out/warning-ok.wav");
  assert.equal(fs.existsSync(path.join(rootPath, result.outputPath)), true);
  assert.equal(result.bytes > 0, true);
});
