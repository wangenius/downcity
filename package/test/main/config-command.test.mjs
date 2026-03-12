/**
 * config 命令组测试（node:test）。
 *
 * 覆盖点（中文）
 * - 验证 `config get/set/unset` 对 ship.json 的通用读写行为。
 * - 验证 `config llm provider/model` 的增改删与 activeModel 切换行为。
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
const CLI_ENTRY = path.resolve(process.cwd(), "bin/console/commands/Index.js");

function createBaseShipConfig() {
  return {
    $schema: "./.ship/schema/ship.schema.json",
    name: "config-test-agent",
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
          temperature: 0.7,
        },
      },
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

async function runCli(args) {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [CLI_ENTRY, ...args],
    {
      cwd: process.cwd(),
    },
  );
  return { stdout, stderr };
}

async function runCliJson(args) {
  const { stdout } = await runCli(args);
  return JSON.parse(stdout);
}

async function runCliExpectFailure(args) {
  try {
    await runCli(args);
    assert.fail(`Expected command to fail: ${args.join(" ")}`);
  } catch (error) {
    assert.equal(typeof error?.stdout, "string");
    const output = JSON.parse(error.stdout);
    assert.equal(output.success, false);
    return output;
  }
}

test("config get/set/unset updates nested ship.json path", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sma-config-cmd-"));
  t.after(async () => {
    await fs.remove(tempRoot);
  });
  await fs.writeJson(path.join(tempRoot, "ship.json"), createBaseShipConfig(), {
    spaces: 2,
  });

  const setResult = await runCliJson([
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
    "config",
    "get",
    "services.chat.queue.maxConcurrency",
    "--path",
    tempRoot,
  ]);
  assert.equal(getResult.success, true);
  assert.equal(getResult.value, 4);

  const unsetResult = await runCliJson([
    "config",
    "unset",
    "services.chat.queue.maxConcurrency",
    "--path",
    tempRoot,
  ]);
  assert.equal(unsetResult.success, true);

  const saved = await fs.readJson(path.join(tempRoot, "ship.json"));
  assert.equal(saved.services.chat.queue.maxConcurrency, undefined);
});

test("config llm provider/model commands manage references and active model", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sma-config-llm-"));
  t.after(async () => {
    await fs.remove(tempRoot);
  });
  await fs.writeJson(path.join(tempRoot, "ship.json"), createBaseShipConfig(), {
    spaces: 2,
  });

  const addProvider = await runCliJson([
    "config",
    "llm",
    "provider",
    "add",
    "openai_main",
    "--type",
    "openai",
    "--api-key",
    "${OPENAI_API_KEY}",
    "--path",
    tempRoot,
  ]);
  assert.equal(addProvider.success, true);
  assert.equal(addProvider.providerId, "openai_main");

  const addModel = await runCliJson([
    "config",
    "llm",
    "model",
    "add",
    "fast",
    "--provider",
    "openai_main",
    "--name",
    "gpt-4o",
    "--temperature",
    "0.3",
    "--path",
    tempRoot,
  ]);
  assert.equal(addModel.success, true);
  assert.equal(addModel.modelId, "fast");

  const activate = await runCliJson([
    "config",
    "llm",
    "model",
    "activate",
    "fast",
    "--path",
    tempRoot,
  ]);
  assert.equal(activate.success, true);
  assert.equal(activate.activeModel, "fast");

  const removeRefProvider = await runCliExpectFailure([
    "config",
    "llm",
    "provider",
    "remove",
    "openai_main",
    "--path",
    tempRoot,
  ]);
  assert.match(String(removeRefProvider.error), /referenced by models/i);

  const updateModel = await runCliJson([
    "config",
    "llm",
    "model",
    "update",
    "fast",
    "--max-tokens",
    "2048",
    "--clear-temperature",
    "--path",
    tempRoot,
  ]);
  assert.equal(updateModel.success, true);
  assert.equal(updateModel.model.maxTokens, 2048);
  assert.equal(updateModel.model.temperature, undefined);

  const removeDefaultModel = await runCliJson([
    "config",
    "llm",
    "model",
    "remove",
    "default",
    "--path",
    tempRoot,
  ]);
  assert.equal(removeDefaultModel.success, true);

  const removeDefaultProvider = await runCliJson([
    "config",
    "llm",
    "provider",
    "remove",
    "default",
    "--path",
    tempRoot,
  ]);
  assert.equal(removeDefaultProvider.success, true);

  const saved = await fs.readJson(path.join(tempRoot, "ship.json"));
  assert.equal(saved.llm.activeModel, "fast");
  assert.equal(saved.llm.providers.openai_main.type, "openai");
  assert.equal(saved.llm.providers.default, undefined);
  assert.equal(saved.llm.models.fast.provider, "openai_main");
  assert.equal(saved.llm.models.fast.maxTokens, 2048);
  assert.equal(saved.llm.models.fast.temperature, undefined);
});
