/**
 * AgentState / ExecutionContext 公共入口桥接测试（node:test）。
 *
 * 关键点（中文）
 * - `@agent/AgentState` 应成为新的统一状态入口。
 * - `ExecutionContext` 应直接从共享 AgentState 读取 model 与 session 能力。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { getExecutionContext, setAgentState } from "../../bin/agent/AgentState.js";

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

test("AgentState public entry exposes shared execution context with model", () => {
  const model = { provider: "test-model" };

  setAgentState({
    cwd: ".",
    rootPath: "/tmp/downcity-agent-state-bridge",
    logger: createLoggerStub(),
    config: {
      name: "demo",
      version: "1.0.0",
      execution: {
        type: "model",
        modelId: "default",
      },
    },
    env: {},
    systems: ["system-a"],
    model,
    sessionStore: {
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
    services: new Map(),
  });

  const context = getExecutionContext();

  assert.equal(context.rootPath, "/tmp/downcity-agent-state-bridge");
  assert.equal(context.session.model, model);
  assert.equal(context.agent.model, model);
  assert.deepEqual(context.systems, ["system-a"]);
});

test("AgentState public entry exposes session context without model in ACP mode", () => {
  setAgentState({
    cwd: ".",
    rootPath: "/tmp/downcity-agent-state-acp",
    logger: createLoggerStub(),
    config: {
      name: "demo-acp",
      version: "1.0.0",
      execution: {
        type: "acp",
        agent: {
          type: "kimi",
        },
      },
    },
    env: {},
    systems: ["system-a"],
    sessionStore: {
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
    services: new Map(),
  });

  const context = getExecutionContext();

  assert.equal(context.rootPath, "/tmp/downcity-agent-state-acp");
  assert.equal(context.session.model, undefined);
  assert.equal(context.agent.model, undefined);
});
