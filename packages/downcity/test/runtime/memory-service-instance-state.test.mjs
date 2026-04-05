/**
 * MemoryService 实例状态测试（node:test）。
 *
 * 关键点（中文）
 * - memory runtime state 应该属于 MemoryService 实例，而不是 module-global 单例。
 * - 即使两个实例绑定到同一个 rootPath，也不应共享同一个 runtime state。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MemoryService } from "../../bin/services/memory/MemoryService.js";

function buildRuntime(rootPath) {
  return {
    rootPath,
    env: {},
    config: {
      context: {
        memory: {
          enabled: false,
        },
      },
    },
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
      log() {},
    },
  };
}

test("MemoryService keeps runtime state per instance", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-memory-service-"));
  const runtime = buildRuntime(rootPath);
  const serviceA = new MemoryService(null);
  const serviceB = new MemoryService(null);

  try {
    await serviceA.lifecycle.start(runtime);
    await serviceB.lifecycle.start(runtime);

    assert.ok(serviceA.runtimeState);
    assert.ok(serviceB.runtimeState);
    assert.notEqual(serviceA.runtimeState, serviceB.runtimeState);

    await serviceA.lifecycle.stop(runtime);

    assert.equal(serviceA.runtimeState, null);
    assert.ok(serviceB.runtimeState);

    await serviceB.lifecycle.stop(runtime);
    assert.equal(serviceB.runtimeState, null);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
