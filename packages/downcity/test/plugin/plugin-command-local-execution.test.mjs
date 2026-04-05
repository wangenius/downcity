/**
 * Plugin 命令本地直执行测试（node:test）。
 *
 * 关键点（中文）
 * - `city <plugin> <action>` 与 `city plugin action ...` 不应再强依赖 agent daemon。
 * - 当命令已拿到本地项目路径时，应直接在当前 CLI 进程内执行 plugin action。
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import fs from "fs-extra";

const execFileAsync = promisify(execFile);
const CLI_ENTRY = path.resolve(process.cwd(), "bin/main/modules/cli/Index.js");

function createBaseConfig() {
  return {
    name: "plugin-local-exec-test",
    version: "1.0.0",
    execution: {
      type: "model",
      modelId: "default",
    },
    plugins: {
      tts: {
        enabled: false,
        format: "wav",
      },
    },
  };
}

async function runCliJson(args, options = {}) {
  const { stdout } = await execFileAsync(process.execPath, [CLI_ENTRY, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
  return JSON.parse(stdout);
}

test("city tts status runs locally without agent daemon", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "city-tts-local-action-"));
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "city-tts-local-home-"));

  t.after(async () => {
    await fs.remove(tempRoot);
    await fs.remove(tempHome);
  });

  await fs.writeJson(path.join(tempRoot, "downcity.json"), createBaseConfig(), {
    spaces: 2,
  });

  const result = await runCliJson(["tts", "status", "--path", tempRoot], {
    env: {
      HOME: tempHome,
    },
  });

  assert.equal(result.success, true);
  assert.equal(typeof result.data, "object");
  assert.equal(typeof result.data.plugin, "object");
});

test("city plugin action tts status runs locally without agent daemon", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "city-plugin-action-local-"));
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "city-plugin-action-home-"));

  t.after(async () => {
    await fs.remove(tempRoot);
    await fs.remove(tempHome);
  });

  await fs.writeJson(path.join(tempRoot, "downcity.json"), createBaseConfig(), {
    spaces: 2,
  });

  const result = await runCliJson(["plugin", "action", "tts", "status", "--path", tempRoot], {
    env: {
      HOME: tempHome,
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.pluginName, "tts");
  assert.equal(result.actionName, "status");
});
