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
import { ConsoleStore } from "../../bin/utils/store/index.js";
import { ShellService } from "../../bin/services/shell/ShellService.js";

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
    plugins: {},
  };
}

test("shell service can start and wait for a long-running shell session", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-shell-service-"));
  const runtime = createRuntimeStub(rootPath);
  const service = new ShellService(null);

  try {
    const started = await service.start(runtime, {
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

    const waited = await service.wait(runtime, {
      shellId: started.shell.shellId,
      afterVersion: started.shell.version,
      fromCursor: started.chunk.endCursor,
      timeoutMs: 1500,
      maxOutputTokens: 200,
    });

    assert.match(waited.chunk.output, /world/);
    assert.equal(waited.shell.status, "completed");
    assert.equal(waited.shell.exitCode, 0);

    const closed = await service.close(runtime, {
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
  const service = new ShellService(null);

  try {
    const executed = await service.exec(runtime, {
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

test("shell service injects console global env and lets agent env override conflicts", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-shell-global-env-"));
  const consoleHome = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-console-home-"));
  const previousConsoleRoot = process.env.DC_CONSOLE_ROOT;
  process.env.DC_CONSOLE_ROOT = consoleHome;

  const runtime = createRuntimeStub(rootPath);
  const service = new ShellService(null);
  runtime.env = {
    SHARED_KEY: "agent",
    AGENT_ONLY: "agent-only",
  };

  const store = new ConsoleStore();

  try {
    await store.upsertGlobalEnvEntry({
      key: "SHARED_KEY",
      value: "global",
    });
    await store.upsertGlobalEnvEntry({
      key: "GLOBAL_ONLY",
      value: "global-only",
    });

    const executed = await service.exec(runtime, {
      cmd: "printf '%s|%s|%s' \"$GLOBAL_ONLY\" \"$AGENT_ONLY\" \"$SHARED_KEY\"",
      shell: "/bin/bash",
      login: false,
      timeoutMs: 5000,
      maxOutputTokens: 200,
    });

    assert.equal(executed.shell.status, "completed");
    assert.equal(executed.shell.exitCode, 0);
    assert.equal(executed.chunk.output, "global-only|agent-only|agent");
  } finally {
    store.close();
    if (previousConsoleRoot === undefined) delete process.env.DC_CONSOLE_ROOT;
    else process.env.DC_CONSOLE_ROOT = previousConsoleRoot;
    await fs.remove(rootPath);
    await fs.remove(consoleHome);
  }
});
