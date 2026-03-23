/**
 * Shell service 基础流程测试（node:test）。
 *
 * 关键点（中文）
 * - 验证 `shell_id` 会话模型可启动、等待、读取输出。
 * - 验证长任务不需要 agent 侧手写空轮询循环。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import {
  closeShellSession,
  execShellCommand,
  startShellSession,
  waitShellSession,
} from "../../bin/services/shell/runtime/SessionStore.js";

function createRuntimeStub(rootPath) {
  return {
    cwd: rootPath,
    rootPath,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      action() {},
    },
    config: {
      permissions: {
        shell: {
          requiresApproval: false,
          maxOutputChars: 12000,
          maxOutputLines: 200,
        },
      },
    },
    env: {},
    systems: [],
    context: {},
    invoke: {},
    services: {},
    assets: {},
    plugins: {},
  };
}

test("shell service can start and wait for a long-running shell session", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-shell-service-"));
  const runtime = createRuntimeStub(rootPath);

  try {
    const started = await startShellSession(runtime, {
      cmd: "printf 'hello\\n'; sleep 0.2; printf 'world\\n'",
      shell: "/bin/bash",
      login: false,
      inlineWaitMs: 20,
      maxOutputTokens: 200,
      autoNotifyOnExit: false,
    });

    assert.ok(started.shell.shellId.startsWith("sh_"));
    assert.equal(started.chunk.startCursor, 0);
    assert.match(started.chunk.output, /hello/);

    const waited = await waitShellSession(runtime, {
      shellId: started.shell.shellId,
      afterVersion: started.shell.version,
      fromCursor: started.chunk.endCursor,
      timeoutMs: 1500,
      maxOutputTokens: 200,
    });

    assert.match(waited.chunk.output, /world/);
    assert.equal(waited.shell.status, "completed");
    assert.equal(waited.shell.exitCode, 0);

    const closed = await closeShellSession(runtime, {
      shellId: started.shell.shellId,
      force: false,
    });
    assert.equal(closed.shell.shellId, started.shell.shellId);
  } finally {
    await fs.remove(rootPath);
  }
});

test("shell service can execute a one-shot shell command", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-shell-exec-"));
  const runtime = createRuntimeStub(rootPath);

  try {
    const executed = await execShellCommand(runtime, {
      cmd: "printf 'quick-one-shot\\n'",
      shell: "/bin/bash",
      login: false,
      timeoutMs: 5000,
      maxOutputTokens: 200,
    });

    assert.equal(executed.shell.status, "completed");
    assert.equal(executed.shell.exitCode, 0);
    assert.match(executed.chunk.output, /quick-one-shot/);
  } finally {
    await fs.remove(rootPath);
  }
});
