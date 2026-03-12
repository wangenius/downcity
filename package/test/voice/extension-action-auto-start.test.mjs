/**
 * Extension action 自动拉起 runtime 测试（node:test）。
 *
 * 覆盖点（中文）
 * - 当 extension runtime 处于 stopped 状态时，执行 action 会自动 start。
 * - 避免调用方必须先显式执行 `sma extension start <name>`。
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import fs from "fs-extra";
import {
  controlExtensionRuntime,
  runExtensionCommand,
} from "../../bin/console/extension/Manager.js";

const execFileAsync = promisify(execFile);
const CLI_ENTRY = path.resolve(
  process.cwd(),
  "bin/console/commands/Index.js",
);

function parseLastJsonLine(stdout) {
  const cleaned = String(stdout || "").replace(/\x1b\[[0-9;]*m/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`No JSON payload found in stdout: ${stdout}`);
  }
  const jsonText = cleaned.slice(start, end + 1);
  return JSON.parse(jsonText);
}

function createRuntimeStub() {
  return {
    cwd: process.cwd(),
    rootPath: process.cwd(),
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      log() {},
    },
    config: {
      $schema: "./.ship/schema/ship.schema.json",
      name: "extension-auto-start-test",
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
    },
    systems: [],
    context: {},
    invoke: {
      async invoke() {
        return { success: false, error: "not implemented in test stub" };
      },
    },
    extensions: {
      async invoke() {
        return { success: false, error: "not implemented in test stub" };
      },
    },
  };
}

test("runExtensionCommand auto-starts runtime for action command", async () => {
  const runtime = createRuntimeStub();

  await controlExtensionRuntime({
    extensionName: "voice",
    action: "stop",
    context: runtime,
  });

  const result = await runExtensionCommand({
    extensionName: "voice",
    command: "models",
    context: runtime,
  });

  assert.equal(result.success, true);
  assert.equal(result.extension?.name, "voice");
  assert.equal(result.extension?.state, "running");
  assert.equal(Array.isArray(result.data?.models), true);
});

test("sma voice on falls back to local execution when daemon is unreachable", async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sma-voice-fallback-"));
  t.after(async () => {
    await fs.remove(tempRoot);
  });

  await fs.writeFile(path.join(tempRoot, "PROFILE.md"), "# profile\n", "utf-8");
  await fs.writeJson(
    path.join(tempRoot, "ship.json"),
    {
      $schema: "./.ship/schema/ship.schema.json",
      name: "voice-local-fallback-test",
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
    },
    { spaces: 2 },
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      CLI_ENTRY,
      "voice",
      "on",
      "SenseVoiceSmall",
      "--no-install",
      "--path",
      tempRoot,
      "--host",
      "127.0.0.1",
      "--port",
      "65534",
      "--json",
      "true",
    ],
    { cwd: process.cwd() },
  );

  const result = parseLastJsonLine(stdout);
  assert.equal(result.success, true);
  assert.match(String(result.message || ""), /executed locally/i);

  const saved = await fs.readJson(path.join(tempRoot, "ship.json"));
  assert.equal(saved.extensions.voice.enabled, true);
  assert.equal(saved.extensions.voice.activeModel, "SenseVoiceSmall");
});
