/**
 * ShellService 实例状态测试（node:test）。
 *
 * 关键点（中文）
 * - shell session 状态应该属于 ShellService 实例，而不是 module-global 单例。
 * - 两个 service 实例即使绑定同一个 rootPath，也不应共享 session map。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ShellService } from "../../bin/services/shell/ShellService.js";

function buildRuntime(rootPath) {
  return {
    cwd: rootPath,
    rootPath,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      action() {},
      log() {},
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
    globalEnv: {},
    systems: [],
    context: {},
    invoke: {},
    services: {},
    plugins: {},
  };
}

test("ShellService keeps session state per instance", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-shell-instance-"));
  const runtime = buildRuntime(rootPath);
  const serviceA = new ShellService(null);
  const serviceB = new ShellService(null);

  try {
    const started = await serviceA.actions.start.execute({
      context: runtime,
      payload: {
        cmd: "printf 'service-a\\n'",
        shell: "/bin/bash",
        login: false,
        inlineWaitMs: 20,
        autoNotifyOnExit: false,
      },
      serviceName: "shell",
      actionName: "start",
    });

    assert.equal(started.success, true);
    assert.ok(serviceA.sessions.size >= 1);
    assert.equal(serviceB.sessions.size, 0);
    assert.notEqual(serviceA.sessions, serviceB.sessions);

    await serviceA.lifecycle.stop(runtime);

    assert.equal(serviceA.sessions.size, 0);
    assert.equal(serviceB.sessions.size, 0);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
