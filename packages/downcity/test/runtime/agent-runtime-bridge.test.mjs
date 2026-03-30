/**
 * AgentRuntime 公共入口桥接测试（node:test）。
 *
 * 关键点（中文）
 * - `@agent/AgentRuntime` 仍然是对外统一入口。
 * - 入口内部应桥接到共享的 RuntimeState / ExecutionRuntime，而不是维护第二套私有状态。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { getExecutionRuntime, setAgentRuntime } from "../../bin/agent/AgentRuntime.js";
import { setExecutionModel } from "../../bin/agent/RuntimeState.js";

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    action() {},
    log() {},
  };
}

test("AgentRuntime public entry uses shared runtime state for execution model", () => {
  const model = { provider: "test-model" };
  setExecutionModel(model);
  setAgentRuntime({
    cwd: ".",
    rootPath: "/tmp/downcity-agent-runtime-bridge",
    logger: createLoggerStub(),
    config: {
      name: "demo",
      version: "1.0.0",
      model: {
        primary: "default",
      },
    },
    env: {},
    systems: ["system-a"],
    sessionRegistry: {
      getRuntime() {
        return null;
      },
      getPersistor() {
        return null;
      },
      run() {
        throw new Error("unused");
      },
      clearRuntime() {},
      afterSessionUpdatedAsync() {
        return Promise.resolve();
      },
      appendUserMessage() {
        return Promise.resolve(null);
      },
      appendAssistantMessage() {
        return Promise.resolve(null);
      },
    },
  });

  const runtime = getExecutionRuntime();

  assert.equal(runtime.rootPath, "/tmp/downcity-agent-runtime-bridge");
  assert.equal(runtime.session.model, model);
  assert.deepEqual(runtime.systems, ["system-a"]);
});
