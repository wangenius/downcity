/**
 * config / console model 命令测试（node:test）。
 *
 * 覆盖点（中文）
 * - 验证 `console config get/set/unset` 对 downcity.json 的通用读写行为。
 * - 验证 `console model add/update/remove/use` 的非交互脚本化能力。
 * - 验证 provider 被 model 引用时的删除保护。
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import fs from "fs-extra";

const execFileAsync = promisify(execFile);
const CLI_ENTRY = path.resolve(process.cwd(), "bin/main/commands/Index.js");

function createBaseConfig() {
  return {
    $schema: "./.downcity/schema/downcity.schema.json",
    name: "config-test-agent",
    version: "1.0.0",
    model: {
      primary: "default",
    },
    services: {
      chat: {
        queue: {
          maxConcurrency: 2,
        },
      },
    },
  };
}

async function runCli(args, options = {}) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [CLI_ENTRY, ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...(options.env || {}),
      },
    },
  );
  return { stdout, stderr };
}

async function runCliJson(args, options = {}) {
  const { stdout } = await runCli(args, options);
  return JSON.parse(stdout);
}

async function runCliExpectFailure(args, options = {}) {
  try {
    await runCli(args, options);
    assert.fail(`Expected command to fail: ${args.join(" ")}`);
  } catch (error) {
    if (typeof error?.stdout === "string" && error.stdout.trim()) {
      const output = JSON.parse(error.stdout);
      assert.equal(output.success, false);
      return output;
    }
    throw error;
  }
}

test("config get/set/unset updates nested downcity.json path", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "city-config-cmd-"));
  t.after(async () => {
    await fs.remove(tempRoot);
  });
  await fs.writeJson(path.join(tempRoot, "downcity.json"), createBaseConfig(), {
    spaces: 2,
  });

  const setResult = await runCliJson([
    "console",
    "config",
    "set",
    "services.chat.queue.maxConcurrency",
    "4",
    "--path",
    tempRoot,
  ]);
  assert.equal(setResult.success, true);
  assert.equal(setResult.value, 4);

  const getResult = await runCliJson([
    "console",
    "config",
    "get",
    "services.chat.queue.maxConcurrency",
    "--path",
    tempRoot,
  ]);
  assert.equal(getResult.success, true);
  assert.equal(getResult.value, 4);

  const unsetResult = await runCliJson([
    "console",
    "config",
    "unset",
    "services.chat.queue.maxConcurrency",
    "--path",
    tempRoot,
  ]);
  assert.equal(unsetResult.success, true);

  const saved = await fs.readJson(path.join(tempRoot, "downcity.json"));
  assert.equal(saved.services.chat.queue.maxConcurrency, undefined);
});

test("console model commands manage provider/model lifecycle and project binding", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "city-config-model-project-"));
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "city-config-model-home-"));
  const cliEnv = { HOME: tempHome };

  t.after(async () => {
    await fs.remove(tempRoot);
    await fs.remove(tempHome);
  });
  await fs.writeJson(path.join(tempRoot, "downcity.json"), createBaseConfig(), {
    spaces: 2,
  });

  const addProvider = await runCliJson([
    "console",
    "model",
    "add",
    "provider",
    "openai_main",
    "--type",
    "openai",
    "--api-key",
    "${OPENAI_API_KEY}",
  ], { env: cliEnv });
  assert.equal(addProvider.success, true);
  assert.equal(addProvider.providerId, "openai_main");

  const addModel = await runCliJson([
    "console",
    "model",
    "add",
    "model",
    "fast",
    "--provider",
    "openai_main",
    "--name",
    "gpt-4o",
    "--temperature",
    "0.3",
  ], { env: cliEnv });
  assert.equal(addModel.success, true);
  assert.equal(addModel.modelId, "fast");
  assert.equal(addModel.model.providerId, "openai_main");

  const useModel = await runCliJson([
    "console",
    "model",
    "use",
    "fast",
    "--path",
    tempRoot,
  ], { env: cliEnv });
  assert.equal(useModel.success, true);
  assert.equal(useModel.nextPrimary, "fast");

  const removeRefProvider = await runCliExpectFailure([
    "console",
    "model",
    "remove",
    "provider",
    "openai_main",
  ], { env: cliEnv });
  assert.match(String(removeRefProvider.error), /referenced by models/i);

  const updateModel = await runCliJson([
    "console",
    "model",
    "update",
    "model",
    "fast",
    "--max-tokens",
    "2048",
    "--clear-temperature",
  ], { env: cliEnv });
  assert.equal(updateModel.success, true);
  assert.equal(updateModel.model.maxTokens, 2048);
  assert.equal(updateModel.model.temperature, undefined);

  const getProvider = await runCliJson([
    "console",
    "model",
    "get",
    "provider",
    "openai_main",
  ], { env: cliEnv });
  assert.equal(getProvider.success, true);
  assert.equal(getProvider.providerId, "openai_main");

  const getModel = await runCliJson([
    "console",
    "model",
    "get",
    "model",
    "fast",
  ], { env: cliEnv });
  assert.equal(getModel.success, true);
  assert.equal(getModel.model.id, "fast");

  const removeModel = await runCliJson([
    "console",
    "model",
    "remove",
    "model",
    "fast",
  ], { env: cliEnv });
  assert.equal(removeModel.success, true);

  const removeProvider = await runCliJson([
    "console",
    "model",
    "remove",
    "provider",
    "openai_main",
  ], { env: cliEnv });
  assert.equal(removeProvider.success, true);

  const saved = await fs.readJson(path.join(tempRoot, "downcity.json"));
  assert.equal(saved.execution.type, "model");
  assert.equal(saved.execution.modelId, "fast");
});

test("console model add model preset supports both moonshot-cn and moonshot-ai providers", async (t) => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "city-config-kimi-home-"));
  const cliEnv = { HOME: tempHome };

  t.after(async () => {
    await fs.remove(tempHome);
  });

  const addCnProvider = await runCliJson([
    "console",
    "model",
    "add",
    "provider",
    "kimi_cn",
    "--type",
    "moonshot-cn",
    "--api-key",
    "test-kimi-key",
  ], { env: cliEnv });
  assert.equal(addCnProvider.success, true);

  const addAiProvider = await runCliJson([
    "console",
    "model",
    "add",
    "provider",
    "kimi_ai",
    "--type",
    "moonshot-ai",
    "--api-key",
    "test-kimi-key",
  ], { env: cliEnv });
  assert.equal(addAiProvider.success, true);

  const addCnModel = await runCliJson([
    "console",
    "model",
    "add",
    "model",
    "kimi_cn_model",
    "--provider",
    "kimi_cn",
    "--preset",
    "kimi-k2.5",
  ], { env: cliEnv });
  assert.equal(addCnModel.success, true);
  assert.equal(addCnModel.model.name, "kimi-k2.5");

  const addAiModel = await runCliJson([
    "console",
    "model",
    "add",
    "model",
    "kimi_ai_model",
    "--provider",
    "kimi_ai",
    "--preset",
    "kimi-k2.5",
  ], { env: cliEnv });
  assert.equal(addAiModel.success, true);
  assert.equal(addAiModel.model.name, "kimi-k2.5");
});

test("console model add model preset supports kimi-code provider", async (t) => {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "city-config-kimi-code-home-"));
  const cliEnv = { HOME: tempHome };

  t.after(async () => {
    await fs.remove(tempHome);
  });

  const addProvider = await runCliJson([
    "console",
    "model",
    "add",
    "provider",
    "kimi_code",
    "--type",
    "kimi-code",
    "--api-key",
    "test-kimi-code-key",
  ], { env: cliEnv });
  assert.equal(addProvider.success, true);

  const addModel = await runCliJson([
    "console",
    "model",
    "add",
    "model",
    "kimi_code_model",
    "--provider",
    "kimi_code",
    "--preset",
    "kimi-for-coding",
  ], { env: cliEnv });
  assert.equal(addModel.success, true);
  assert.equal(addModel.model.name, "kimi-for-coding");
});
