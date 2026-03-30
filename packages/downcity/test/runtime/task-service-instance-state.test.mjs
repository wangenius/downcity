/**
 * TaskService 实例状态测试（node:test）。
 *
 * 关键点（中文）
 * - cron engine 应该属于 TaskService 实例，而不是 module-global 单例。
 * - 不同 service 实例启动后应持有不同 engine，停止一个不应影响另一个。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TaskService } from "../../bin/services/task/TaskService.js";

function buildRuntime(rootPath) {
  return {
    rootPath,
    env: {},
    config: {},
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
      log() {},
    },
  };
}

test("TaskService keeps cron runtime state per instance", async () => {
  const rootA = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-task-service-a-"));
  const rootB = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-task-service-b-"));
  const runtimeA = buildRuntime(rootA);
  const runtimeB = buildRuntime(rootB);
  const serviceA = new TaskService(null);
  const serviceB = new TaskService(null);

  try {
    await serviceA.lifecycle.start(runtimeA);
    await serviceB.lifecycle.start(runtimeB);

    assert.ok(serviceA.cronEngine);
    assert.ok(serviceB.cronEngine);
    assert.notEqual(serviceA.cronEngine, serviceB.cronEngine);

    await serviceA.lifecycle.stop(runtimeA);

    assert.equal(serviceA.cronEngine, null);
    assert.ok(serviceB.cronEngine);

    await serviceB.lifecycle.stop(runtimeB);
    assert.equal(serviceB.cronEngine, null);
  } finally {
    await fs.rm(rootA, { recursive: true, force: true });
    await fs.rm(rootB, { recursive: true, force: true });
  }
});
