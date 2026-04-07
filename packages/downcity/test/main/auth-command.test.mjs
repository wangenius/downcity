/**
 * auth token CLI 命令测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定 token 管理只能由本机 CLI 执行。
 * - 覆盖 list/create/revoke 三个最小管理动作。
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

test("auth token command manages local access tokens", async (t) => {
  const consoleRoot = await fs.mkdtemp(path.join(os.tmpdir(), "city-auth-command-"));
  t.after(async () => {
    await fs.remove(consoleRoot);
  });

  const cliEnv = {
    DC_CONSOLE_ROOT: consoleRoot,
  };

  const created = await runCliJson([
    "auth",
    "token",
    "create",
    "console-ui",
    "--activate",
    "--json",
  ], { env: cliEnv });
  assert.equal(created.success, true);
  assert.equal(created.token.name, "console-ui");
  assert.equal(typeof created.token.token, "string");
  assert.equal(created.token.token.startsWith("dc_"), true);

  const listed = await runCliJson([
    "auth",
    "token",
    "list",
    "--json",
  ], { env: cliEnv });
  assert.equal(listed.success, true);
  assert.equal(Array.isArray(listed.tokens), true);
  assert.equal(listed.tokens.length, 1);
  assert.equal(listed.tokens[0].name, "console-ui");

  const revoked = await runCliJson([
    "auth",
    "token",
    "revoke",
    listed.tokens[0].id,
    "--json",
  ], { env: cliEnv });
  assert.equal(revoked.success, true);
  assert.equal(revoked.token.id, listed.tokens[0].id);
  assert.equal(typeof revoked.token.revokedAt, "string");
});
