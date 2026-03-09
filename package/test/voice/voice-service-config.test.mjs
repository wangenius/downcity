/**
 * voice extension 配置动作测试（node:test）。
 *
 * 覆盖点（中文）
 * - `voice on` 在不下载模型时也能正确写入 `extensions.voice`。
 * - `voice use` 对“未安装模型”做保护校验。
 * - `voice off` 能关闭服务并保留已安装模型记录。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import { voiceExtension } from "../../bin/extensions/voice/Index.js";

function createBaseShipConfig() {
  return {
    $schema: "./.ship/schema/ship.schema.json",
    name: "voice-service-test",
    version: "1.0.0",
    llm: {
      activeModel: "default",
      providers: {
        default: {
          type: "anthropic",
          apiKey: "${LLM_API_KEY}",
        },
      },
      models: {
        default: {
          provider: "default",
          name: "claude-sonnet-4-5",
        },
      },
    },
    services: {},
    extensions: {},
  };
}

function buildRuntime(rootPath, config) {
  return {
    rootPath,
    config,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      log() {},
    },
  };
}

test("voice install skips download when local model files already exist", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sma-voice-install-skip-"));
  t.after(async () => {
    await fs.remove(tempRoot);
  });

  const modelsDir = path.join(tempRoot, ".ship", "models", "voice");
  const modelDir = path.join(modelsDir, "SenseVoiceSmall");
  await fs.ensureDir(modelDir);
  await fs.writeFile(path.join(modelDir, "model.bin"), "dummy", "utf-8");

  const config = createBaseShipConfig();
  await fs.writeJson(path.join(tempRoot, "ship.json"), config, { spaces: 2 });
  const runtime = buildRuntime(tempRoot, config);

  const originalFetch = globalThis.fetch;
  const fetchCalls = [];
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    throw new Error("fetch should not be called when model is already installed");
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await voiceExtension.actions.install.execute({
    context: runtime,
    payload: {
      modelIds: ["SenseVoiceSmall"],
      force: false,
      modelsDir,
    },
    extensionName: "voice",
    actionName: "install",
  });
  assert.equal(result.success, true);
  assert.equal(fetchCalls.length, 0);
  assert.equal(result.data.installResults.length, 1);
  assert.equal(result.data.installResults[0].skipped, true);
  assert.equal(result.data.installResults[0].skipSource, "directory");
});

test("voice on/off/use updates extensions.voice config in ship.json", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sma-voice-service-"));
  t.after(async () => {
    await fs.remove(tempRoot);
  });

  const config = createBaseShipConfig();
  await fs.writeJson(path.join(tempRoot, "ship.json"), config, { spaces: 2 });
  const runtime = buildRuntime(tempRoot, config);

  const onResult = await voiceExtension.actions.on.execute({
    context: runtime,
    payload: {
      modelIds: ["SenseVoiceSmall"],
      install: false,
      force: false,
    },
    extensionName: "voice",
    actionName: "on",
  });
  assert.equal(onResult.success, true);

  const useFailed = await voiceExtension.actions.use.execute({
    context: runtime,
    payload: {
      modelId: "whisper-large-v3-turbo",
    },
    extensionName: "voice",
    actionName: "use",
  });
  assert.equal(useFailed.success, false);
  assert.match(String(useFailed.error || ""), /not installed/i);

  const useSuccess = await voiceExtension.actions.use.execute({
    context: runtime,
    payload: {
      modelId: "SenseVoiceSmall",
    },
    extensionName: "voice",
    actionName: "use",
  });
  assert.equal(useSuccess.success, true);

  const offResult = await voiceExtension.actions.off.execute({
    context: runtime,
    payload: {},
    extensionName: "voice",
    actionName: "off",
  });
  assert.equal(offResult.success, true);

  const saved = await fs.readJson(path.join(tempRoot, "ship.json"));
  assert.equal(saved.extensions.voice.enabled, false);
  assert.equal(saved.extensions.voice.provider, "local");
  assert.equal(saved.extensions.voice.activeModel, "SenseVoiceSmall");
  assert.deepEqual(saved.extensions.voice.installedModels, ["SenseVoiceSmall"]);
});

test("voice on command mapInput parses no-install/force and model IDs", async () => {
  const payload = await voiceExtension.actions.on.command.mapInput({
    args: ["sensevoice-small", "whisper-large-v3-turbo"],
    opts: {
      install: false,
      force: true,
      modelsDir: ".ship/models/voice-custom",
      activeModel: "SenseVoiceSmall",
    },
  });

  assert.deepEqual(payload.modelIds, ["SenseVoiceSmall", "whisper-large-v3-turbo"]);
  assert.equal(payload.install, false);
  assert.equal(payload.force, true);
  assert.equal(payload.modelsDir, ".ship/models/voice-custom");
  assert.equal(payload.activeModel, "SenseVoiceSmall");
});

test("voice init command mapInput applies defaults when models are provided", async () => {
  const payload = await voiceExtension.actions.init.command.mapInput({
    args: ["SenseVoiceSmall"],
    opts: {},
  });

  assert.deepEqual(payload.modelIds, ["SenseVoiceSmall"]);
  assert.equal(payload.activeModel, "SenseVoiceSmall");
  assert.equal(payload.installModel, true);
  assert.equal(payload.installDeps, true);
  assert.equal(payload.pipUpgrade, true);
});

test("voice init can enable extension without downloading when model already installed", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sma-voice-init-"));
  t.after(async () => {
    await fs.remove(tempRoot);
  });

  const config = createBaseShipConfig();
  config.extensions = {
    voice: {
      enabled: false,
      provider: "local",
      activeModel: "SenseVoiceSmall",
      modelsDir: ".ship/models/voice",
      installedModels: ["SenseVoiceSmall"],
    },
  };
  await fs.writeJson(path.join(tempRoot, "ship.json"), config, { spaces: 2 });
  const runtime = buildRuntime(tempRoot, config);

  const initResult = await voiceExtension.actions.init.execute({
    context: runtime,
    payload: {
      modelIds: ["SenseVoiceSmall"],
      installModel: false,
      installDeps: false,
      force: false,
      activeModel: "SenseVoiceSmall",
      pipUpgrade: true,
      pythonBin: "python3",
    },
    extensionName: "voice",
    actionName: "init",
  });
  assert.equal(initResult.success, true);

  const saved = await fs.readJson(path.join(tempRoot, "ship.json"));
  assert.equal(saved.extensions.voice.enabled, true);
  assert.equal(saved.extensions.voice.provider, "local");
  assert.equal(saved.extensions.voice.activeModel, "SenseVoiceSmall");
  assert.equal(saved.extensions.voice.transcribe.strategy, "funasr");
});
