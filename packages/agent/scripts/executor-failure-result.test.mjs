/**
 * @file 验证执行器失败结果不会伪造 Assistant 正文。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { MockLanguageModelV3 } from "ai/test";

import { CoreEngineRunner } from "../bin/executor/core-engine/CoreEngineRunner.js";
import { ExecutorRecoveryPolicy } from "../bin/executor/services/ExecutorRecoveryPolicy.js";

function create_run_context() {
  return {
    sessionId: "executor-failure-test",
    injectedUserMessages: [],
    deferredPersistedUserMessages: [],
    pendingAssistantFileParts: [],
  };
}

test("CoreEngine Provider 失败时只返回结构化错误", async () => {
  const model = new MockLanguageModelV3({
    modelId: "failing-model",
    doStream: async () => {
      throw new Error("quota exceeded");
    },
  });
  const runner = new CoreEngineRunner({
    session_id: "executor-failure-test",
    logger: { log: async () => {} },
    should_compact_on_error: () => false,
  });
  const messages = [{
    id: "user-1",
    role: "user",
    metadata: {
      v: 1,
      ts: 1,
      sessionId: "executor-failure-test",
      source: "ingress",
      kind: "normal",
    },
    parts: [{ type: "text", text: "hello" }],
  }];

  const result = await runner.run({
    execute_input: { query: "hello", system: [], messages, tools: {} },
    model,
    run_context: create_run_context(),
    resolve_step_inputs: async () => ({ model, system: [], tools: {} }),
    reload_history: async () => messages,
  });

  assert.equal(result.success, false);
  assert.match(result.error, /quota exceeded/);
  assert.equal(result.assistantMessage, undefined);
});

test("恢复策略捕获普通异常后只返回结构化错误", async () => {
  const policy = new ExecutorRecoveryPolicy({
    session_id: "executor-failure-test",
    logger: { log: async () => {} },
    should_compact: () => false,
  });
  const run_context = create_run_context();
  const result = await policy.run_with_retry({
    query: "hello",
    model: {},
    run_context,
    prepare_execute_input: async () => {
      throw new Error("configuration failed");
    },
    execute_prepared_run: async () => {
      throw new Error("unexpected execution");
    },
  });

  assert.equal(result.success, false);
  assert.match(result.error, /configuration failed/);
  assert.equal(result.assistantMessage, undefined);
});
