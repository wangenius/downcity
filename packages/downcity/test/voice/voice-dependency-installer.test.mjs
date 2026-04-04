/**
 * voice 依赖安装器辅助函数测试（node:test）。
 *
 * 覆盖点（中文）
 * - 模型到 runner 的映射稳定。
 * - 多模型场景下 runner 去重正确。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  isPep668InstallError,
  resolveVoiceRunnerByModel,
  resolveVoiceRunnersByModels,
  resolveVoiceStrategyByModel,
} from "../../bin/plugins/voice@/city/runtime/console/DependencyInstaller.js";

test("resolveVoiceRunnerByModel maps each model to expected runner", () => {
  assert.equal(resolveVoiceRunnerByModel("SenseVoiceSmall"), "funasr");
  assert.equal(resolveVoiceRunnerByModel("paraformer-zh-streaming"), "funasr");
  assert.equal(
    resolveVoiceRunnerByModel("whisper-large-v3-turbo"),
    "transformers-whisper",
  );
});

test("resolveVoiceRunnersByModels returns deduplicated runner list", () => {
  const runners = resolveVoiceRunnersByModels([
    "SenseVoiceSmall",
    "paraformer-zh-streaming",
    "whisper-large-v3-turbo",
  ]);
  assert.deepEqual(runners, ["funasr", "transformers-whisper"]);
});

test("resolveVoiceStrategyByModel follows runner recommendation", () => {
  assert.equal(resolveVoiceStrategyByModel("SenseVoiceSmall"), "funasr");
  assert.equal(resolveVoiceStrategyByModel("whisper-large-v3-turbo"), "transformers-whisper");
});

test("isPep668InstallError matches common Homebrew/PEP668 errors", () => {
  assert.equal(
    isPep668InstallError("error: externally-managed-environment"),
    true,
  );
  assert.equal(
    isPep668InstallError("See PEP 668 for the detailed specification."),
    true,
  );
  assert.equal(
    isPep668InstallError("you can pass --break-system-packages"),
    true,
  );
  assert.equal(
    isPep668InstallError("No module named funasr"),
    false,
  );
});
