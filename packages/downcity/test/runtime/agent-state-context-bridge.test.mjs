/**
 * AgentRuntime / AgentContext 公共入口桥接测试（node:test）。
 *
 * 关键点（中文）
 * - `AgentRuntime` 应成为新的统一状态入口。
 * - `AgentContext` 应直接从共享 AgentRuntime 读取 model 与 session 能力。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { getAgentContext, setAgentRuntime } from "../../bin/main/agent/AgentRuntime.js";

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

function createSessionStub() {
  return {
    sessionId: "chat-1",
    getExecutor() {
      return null;
    },
    getHistoryComposer() {
      return null;
    },
    run() {
      throw new Error("unused");
    },
    clearExecutor() {},
    afterSessionUpdatedAsync() {
      return Promise.resolve();
    },
    appendUserMessage() {
      return Promise.resolve(null);
    },
    appendAssistantMessage() {
      return Promise.resolve(null);
    },
    isExecuting() {
      return false;
    },
  };
}

test("AgentRuntime public entry exposes shared agent context with model", () => {
  const model = { provider: "test-model" };

  setAgentRuntime({
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
    getSession() {
      return createSessionStub();
    },
    listExecutingSessionIds() {
      return [];
    },
    getExecutingSessionCount() {
      return 0;
    },
    services: new Map(),
  });

  const context = getAgentContext();

  assert.equal(context.rootPath, "/tmp/downcity-agent-state-bridge");
  assert.equal(context.session.model, model);
  assert.equal(context.agent.model, model);
  assert.deepEqual(context.systems, ["system-a"]);
});

test("AgentRuntime public entry exposes session context without model in ACP mode", () => {
  setAgentRuntime({
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
    getSession() {
      return createSessionStub();
    },
    listExecutingSessionIds() {
      return [];
    },
    getExecutingSessionCount() {
      return 0;
    },
    services: new Map(),
  });

  const context = getAgentContext();

  assert.equal(context.rootPath, "/tmp/downcity-agent-state-acp");
  assert.equal(context.session.model, undefined);
  assert.equal(context.agent.model, undefined);
});
