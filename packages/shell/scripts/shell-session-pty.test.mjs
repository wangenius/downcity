/**
 * @file 验证模型可见 shell 工具与 PTY session 行为。
 *
 * 关键点（中文）
 * - `shell_exec` 保持非交互 pipe 语义。
 * - `shell_session` 的底层 start 使用 PTY，让交互式程序能检测到 TTY。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { Shell } from "@downcity/shell";
import {
  closeAllShellSessions,
  createShellRuntimeState,
  execShellCommand,
  startShellSession,
} from "@downcity/shell/session/ShellActionRuntime.js";

async function create_context() {
  const root_path = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-shell-pty-"));
  return {
    root_path,
    context: {
      rootPath: root_path,
      env: {},
      config: { id: "test-agent" },
      paths: {
        getDowncityChannelMetaPath: () =>
          path.join(root_path, ".downcity", "channel", "meta.json"),
      },
      session: {
        get: () => ({
          publishEvent: () => undefined,
        }),
      },
    },
  };
}

test("Shell exposes only shell_exec and shell_session model tools", () => {
  const shell = new Shell({ root_path: process.cwd() });
  assert.deepEqual(Object.keys(shell.tools).sort(), ["shell_exec", "shell_session"]);
});

test("shell_session uses PTY while shell_exec stays non-interactive", async () => {
  const fixture = await create_context();
  const state = createShellRuntimeState({
    defaultInlineWaitMs: 80,
    defaultExecTimeoutMs: 2000,
  });
  try {
    const detect_tty_cmd = "[ -t 1 ] && printf tty || printf notty";
    const exec_result = await execShellCommand(state, fixture.context, {
      cmd: detect_tty_cmd,
      cwd: fixture.root_path,
      shell: "/bin/sh",
      login: false,
      timeoutMs: 2000,
      sandbox: "safe",
    });
    assert.match(exec_result.chunk?.output || "", /notty$/);
    assert.equal(exec_result.shell?.terminal, false);

    const session_result = await startShellSession(state, fixture.context, {
      cmd: detect_tty_cmd,
      cwd: fixture.root_path,
      shell: "/bin/sh",
      login: false,
      inlineWaitMs: 200,
      sandbox: "safe",
    });
    assert.match(session_result.chunk?.output || "", /tty/);
    assert.equal(session_result.shell?.terminal, true);
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture.root_path, { recursive: true, force: true });
  }
});

test("shell_exec honors an explicit short total timeout", async () => {
  const fixture = await create_context();
  const state = createShellRuntimeState({ defaultExecTimeoutMs: 2000 });
  const started_at = Date.now();
  try {
    await assert.rejects(
      execShellCommand(state, fixture.context, {
        cmd: "sleep 2",
        cwd: fixture.root_path,
        shell: "/bin/sh",
        login: false,
        timeoutMs: 80,
        sandbox: "safe",
      }),
      /shell\.exec timed out after 80ms/,
    );
    assert.ok(Date.now() - started_at < 1500);
  } finally {
    await closeAllShellSessions(state, true);
    await fs.rm(fixture.root_path, { recursive: true, force: true });
  }
});

test("shell dispose resolves approvals without waiting for event projection", async () => {
  const fixture = await create_context();
  const state = createShellRuntimeState();
  state.context = {
    ...fixture.context,
    session: {
      get: () => ({ publishEvent: () => new Promise(() => undefined) }),
    },
  };
  let decision;
  const timer = setTimeout(() => undefined, 60_000);
  timer.unref();
  state.approvals.set("ap_pending", {
    approvalId: "ap_pending",
    shellId: "sh_pending",
    ownerContextId: "session_1",
    toolName: "shell_exec",
    cmd: "pwd",
    operation: "exec",
    cwd: fixture.root_path,
    reason: "test dispose",
    createdAt: Date.now(),
    timer,
    resolve: (status) => {
      decision = status;
    },
  });

  const started_at = Date.now();
  await closeAllShellSessions(state, true);
  assert.equal(decision, "expired");
  assert.ok(Date.now() - started_at < 200);
  await fs.rm(fixture.root_path, { recursive: true, force: true });
});
