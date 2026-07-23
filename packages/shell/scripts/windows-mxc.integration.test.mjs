/**
 * @file Windows MXC development sandbox 原生集成测试。
 *
 * 关键点（中文）
 * - 只在 Windows CI/宿主执行，其他平台显式 skip。
 * - 同时验证 cmd 命令模型、PATH 工具、workspace 写权限与项目外写隔离。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  closeAllShellSessions,
  createShellRuntimeState,
  execShellCommand,
} from "../bin/session/ShellActionRuntime.js";

test("Windows MXC runs cmd and confines writes to the workspace", {
  skip: process.platform !== "win32",
  timeout: 120_000,
}, async () => {
  const fixture_root = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-win-sandbox-"));
  const project_root = path.join(fixture_root, "project");
  const outside_path = path.join(fixture_root, "outside.txt");
  const state = createShellRuntimeState();
  await fs.mkdir(project_root, { recursive: true });
  try {
    const execute_result = await execShellCommand(state, {
      rootPath: project_root,
      env: { WINDOWS_TEST_VALUE: "downcity" },
    }, {
      cmd: "echo %WINDOWS_TEST_VALUE% && node -e \"process.stdout.write('node-ok')\" && echo allowed>inside.txt",
      sandbox: "safe",
      timeoutMs: 60_000,
    });
    assert.equal(execute_result.shell.status, "completed", execute_result.chunk.output);
    assert.match(execute_result.chunk.output, /downcity/i);
    assert.match(execute_result.chunk.output, /node-ok/i);
    assert.equal((await fs.readFile(path.join(project_root, "inside.txt"), "utf8")).trim(), "allowed");
    assert.equal(execute_result.shell.sandboxBackend, "windows-mxc-dev");

    const escaped_path = outside_path.replaceAll("%", "%%");
    const escape_result = await execShellCommand(state, {
      rootPath: project_root,
      env: {},
    }, {
      cmd: `echo denied>"${escaped_path}"`,
      sandbox: "safe",
      timeoutMs: 60_000,
    });
    assert.equal(escape_result.shell.status, "failed", escape_result.chunk.output);
    await assert.rejects(fs.access(outside_path));
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture_root, { recursive: true, force: true });
  }
});
