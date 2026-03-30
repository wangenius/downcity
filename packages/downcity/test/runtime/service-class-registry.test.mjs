/**
 * Service class registry 测试（node:test）。
 *
 * 关键点（中文）
 * - agent 应该持有一组 per-agent service 实例，而不是共享全局 singleton。
 * - 第一阶段允许继续复用 legacy service definition，但实例层必须已经 class 化。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { BaseService } from "../../bin/services/BaseService.js";
import { createRegisteredServiceInstances } from "../../bin/main/registries/ServiceClassRegistry.js";

function createAgentStub(rootPath) {
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
      name: "demo",
      version: "1.0.0",
      model: {
        primary: "default",
      },
    },
    env: {},
    systems: [],
    sessionStore: {},
  };
}

test("service class registry creates per-agent BaseService instances", () => {
  const agentA = createAgentStub("/tmp/downcity-agent-a");
  const agentB = createAgentStub("/tmp/downcity-agent-b");

  const servicesA = createRegisteredServiceInstances(agentA);
  const servicesB = createRegisteredServiceInstances(agentB);

  assert.equal(servicesA.has("chat"), true);
  assert.equal(servicesA.has("task"), true);
  assert.equal(servicesA.has("memory"), true);
  assert.equal(servicesA.has("shell"), true);

  assert.equal(servicesA.get("chat") instanceof BaseService, true);
  assert.equal(servicesA.get("task") instanceof BaseService, true);

  assert.notEqual(servicesA.get("chat"), servicesB.get("chat"));
  assert.notEqual(servicesA.get("task"), servicesB.get("task"));
});
