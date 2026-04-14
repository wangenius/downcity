/**
 * env copy CLI 命令测试（node:test）。
 *
 * 关键点（中文）
 * - `city env copy` 会输出可直接写入 `.env` 的明文 dotenv 内容。
 * - secret value 只在该命令中显式输出，`list` 仍然只展示 key 与元数据。
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
  let failure = null;
  try {
    await runCli(args, options);
  } catch (error) {
    failure = error;
  }
  if (!failure) {
    assert.fail(`Expected command to fail: ${args.join(" ")}`);
  }
  return {
    stdout: String(failure?.stdout || ""),
    stderr: String(failure?.stderr || ""),
    status: typeof failure?.code === "number" ? failure.code : 1,
  };
}

test("env copy emits dotenv formatted values for the selected scope", async (t) => {
  const consoleRoot = await fs.mkdtemp(path.join(os.tmpdir(), "city-env-copy-"));
  t.after(async () => {
    await fs.remove(consoleRoot);
  });

  const cliEnv = {
    DC_CONSOLE_ROOT: consoleRoot,
  };

  await runCliJson([
    "env",
    "set",
    "PLAIN_KEY",
    "plain-value",
    "--json",
  ], { env: cliEnv });
  await runCliJson([
    "env",
    "set",
    "QUOTED_KEY",
    "value with spaces and \"quotes\"",
    "--json",
  ], { env: cliEnv });
  await runCliJson([
    "env",
    "set",
    "AGENT_ONLY",
    "agent-value",
    "--agent",
    "/tmp/downcity-agent-a",
    "--json",
  ], { env: cliEnv });

  const globalCopy = await runCli(["env", "copy"], { env: cliEnv });
  assert.equal(
    globalCopy.stdout,
    "PLAIN_KEY=plain-value\nQUOTED_KEY=\"value with spaces and \\\"quotes\\\"\"\n",
  );
  assert.equal(globalCopy.stderr, "");

  const agentCopy = await runCli([
    "env",
    "copy",
    "--agent",
    "/tmp/downcity-agent-a",
  ], { env: cliEnv });
  assert.equal(agentCopy.stdout, "AGENT_ONLY=agent-value\n");
});

test("env copy is blocked when invoked from an agent shell context", async (t) => {
  const consoleRoot = await fs.mkdtemp(path.join(os.tmpdir(), "city-env-copy-agent-"));
  t.after(async () => {
    await fs.remove(consoleRoot);
  });

  const cliEnv = {
    DC_CONSOLE_ROOT: consoleRoot,
  };

  await runCliJson([
    "env",
    "set",
    "SECRET_KEY",
    "should-not-leak",
    "--json",
  ], { env: cliEnv });

  const result = await runCliExpectFailure([
    "env",
    "copy",
  ], {
    env: {
      ...cliEnv,
      DC_AGENT_PATH: "/tmp/downcity-agent-shell",
      DC_AGENT_NAME: "downcity-agent-shell",
    },
  });

  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.doesNotMatch(result.stderr, /should-not-leak/);
  assert.match(result.stderr, /local CLI/i);
});
