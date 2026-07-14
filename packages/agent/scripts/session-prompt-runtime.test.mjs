/**
 * @file 验证 SessionPromptRuntime 的 actor 队列语义。
 *
 * 关键点（中文）
 * - 测试编译后的 bin 输出，避免把测试文件混入 package 源码导出面。
 * - 重点锁住 prompt merge 与排队到下一 turn 的行为，防止后续重构破坏交互模型。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SessionPromptRuntime } from "../bin/session/runtime/SessionPromptRuntime.js";

function createDeferred() {
  let resolve;
  const promise = new Promise((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve,
  };
}

function createUserMessage(query, index) {
  return {
    id: `u:test:${String(index)}`,
    role: "user",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId: "test",
      source: "sdk",
      kind: "normal",
    },
    parts: [{ type: "text", text: query }],
  };
}

function createAssistantMessage(text, index) {
  return {
    id: `a:test:${String(index)}`,
    role: "assistant",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId: "test",
      source: "sdk",
      kind: "normal",
    },
    parts: [{ type: "text", text }],
  };
}

async function waitUntil(readValue) {
  for (let index = 0; index < 20; index += 1) {
    const value = readValue();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out while waiting for test condition");
}

async function isSettled(promise) {
  const marker = {};
  const result = await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise((resolve) => setTimeout(() => resolve(marker), 0)),
  ]);
  return result !== marker;
}

test("SessionPromptRuntime merges queued prompts at the next step boundary", async () => {
  const events = [];
  const persisted = [];
  const merge_lifecycle = [];
  const executionFinished = createDeferred();
  let stepMerge = null;

  const runtime = new SessionPromptRuntime({
    sessionId: "test",
    publish: (event) => {
      events.push(event);
    },
    createAndPersistUserMessage: async (input) => {
      const message = createUserMessage(input.query, persisted.length + 1);
      persisted.push(message);
      merge_lifecycle.push(`message:${input.query}`);
      return message;
    },
    appendErrorMessage: async () => {},
    executeTurn: async (input) => {
      stepMerge = input.onStepMerge;
      await executionFinished.promise;
      return {
        text: "done",
        success: true,
        assistantMessage: createAssistantMessage("done", 1),
      };
    },
    stopTurn: () => false,
  });

  const firstTurn = await runtime.prompt({ query: "first" });
  const secondTurnPromise = runtime.prompt({ query: "second" });
  const merge = await waitUntil(() => stepMerge);

  assert.equal(await isSettled(secondTurnPromise), false);

  const mergedMessages = await merge();
  const secondTurn = await secondTurnPromise;

  assert.equal(secondTurn.id, firstTurn.id);
  assert.deepEqual(
    mergedMessages.map((message) => message.parts[0]?.text),
    ["second"],
  );
  assert.deepEqual(
    persisted.map((message) => message.parts[0]?.text),
    ["first", "second"],
  );
  assert.deepEqual(merge_lifecycle, [
    "message:first",
    "message:second",
  ]);

  executionFinished.resolve();
  const result = await firstTurn.finished;

  assert.equal(result.success, true);
  assert.equal(result.text, "done");
  assert.equal(secondTurn.result, result);
  assert.deepEqual(
    events.map((event) => event.type),
    ["start", "finish"],
  );
});

test("SessionPromptRuntime applies config and steer in queue order at the same step checkpoint", async () => {
  const lifecycle = [];
  const applied_turn_ids = [];
  const execution_finished = createDeferred();
  let step_merge = null;

  const runtime = new SessionPromptRuntime({
    sessionId: "test",
    publish: () => {},
    createAndPersistUserMessage: async (input, _turn_id, input_type) => {
      lifecycle.push(`${input_type}:${input.query}`);
      return createUserMessage(input.query, lifecycle.length);
    },
    appendErrorMessage: async () => {},
    executeTurn: async (input) => {
      step_merge = input.onStepMerge;
      await execution_finished.promise;
      return {
        text: "done",
        success: true,
        assistantMessage: createAssistantMessage("done", 1),
      };
    },
    stopTurn: () => false,
  });

  runtime.enqueue_command({
    type: "command",
    command_id: "config-1",
    scope: "agent",
    execute: async ({ turn_id }) => {
      applied_turn_ids.push(turn_id);
      lifecycle.push("config:1");
    },
  });
  const first_turn = await runtime.prompt({ query: "first" });
  const merge = await waitUntil(() => step_merge);
  runtime.enqueue_command({
    type: "command",
    command_id: "config-2",
    scope: "session",
    execute: async ({ turn_id }) => {
      applied_turn_ids.push(turn_id);
      lifecycle.push("config:2");
    },
  });
  const second_turn_promise = runtime.prompt({ query: "second" });

  const messages = await merge();
  const second_turn = await second_turn_promise;

  assert.equal(second_turn.id, first_turn.id);
  assert.deepEqual(
    messages.map((message) => message.parts[0]?.text),
    ["second"],
  );
  assert.deepEqual(lifecycle, [
    "config:1",
    "prompt:first",
    "config:2",
    "steer:second",
  ]);
  assert.deepEqual(applied_turn_ids, [first_turn.id, first_turn.id]);

  execution_finished.resolve();
  await first_turn.finished;
});

test("SessionPromptRuntime keeps command queued without starting a turn", async () => {
  let apply_count = 0;
  const runtime = new SessionPromptRuntime({
    sessionId: "test",
    publish: () => {},
    createAndPersistUserMessage: async (input) => createUserMessage(input.query, 1),
    appendErrorMessage: async () => {},
    executeTurn: async () => ({ text: "done", success: true }),
    stopTurn: () => false,
  });

  runtime.enqueue_command({
    type: "command",
    command_id: "config-only",
    scope: "agent",
    execute: async () => {
      apply_count += 1;
    },
  });

  assert.equal(runtime.isActive(), false);
  assert.equal(runtime.has_pending_command(), true);
  assert.equal(apply_count, 0);
});

test("SessionPromptRuntime moves unmerged prompts into the next turn", async () => {
  const events = [];
  const finishQueue = [];

  const runtime = new SessionPromptRuntime({
    sessionId: "test",
    publish: (event) => {
      events.push(event);
    },
    createAndPersistUserMessage: async (input) => {
      return createUserMessage(input.query, events.length + 1);
    },
    appendErrorMessage: async () => {},
    executeTurn: async (input) => {
      const deferred = createDeferred();
      finishQueue.push({
        query: input.promptInput.query,
        deferred,
      });
      await deferred.promise;
      return {
        text: `done:${input.promptInput.query}`,
        success: true,
        assistantMessage: createAssistantMessage(
          `done:${input.promptInput.query}`,
          finishQueue.length,
        ),
      };
    },
    stopTurn: () => false,
  });

  const firstTurn = await runtime.prompt({ query: "first" });
  const secondTurnPromise = runtime.prompt({ query: "second" });
  const firstExecution = await waitUntil(() => finishQueue[0]);

  assert.equal(await isSettled(secondTurnPromise), false);

  firstExecution.deferred.resolve();
  const firstResult = await firstTurn.finished;
  const secondTurn = await secondTurnPromise;
  const secondExecution = await waitUntil(() => finishQueue[1]);

  assert.notEqual(secondTurn.id, firstTurn.id);
  assert.equal(firstResult.text, "done:first");
  assert.equal(secondExecution.query, "second");

  secondExecution.deferred.resolve();
  const secondResult = await secondTurn.finished;

  assert.equal(secondResult.text, "done:second");
  assert.deepEqual(
    events.map((event) => event.type),
    ["start", "finish", "start", "finish"],
  );
});

test("SessionPromptRuntime stops current turn and cancels unmerged queued prompts", async () => {
  const events = [];
  const executionFinished = createDeferred();
  let stopRequested = false;

  const runtime = new SessionPromptRuntime({
    sessionId: "test",
    publish: (event) => {
      events.push(event);
    },
    createAndPersistUserMessage: async (input) => {
      return createUserMessage(input.query, events.length + 1);
    },
    appendErrorMessage: async () => {},
    executeTurn: async (input) => {
      await new Promise((resolve) => {
        input.abortSignal.addEventListener("abort", resolve, { once: true });
      });
      await executionFinished.promise;
      return {
        text: "partial answer",
        success: false,
        assistantMessage: createAssistantMessage("partial answer", 1),
        error: "Turn stopped",
      };
    },
    stopTurn: () => {
      stopRequested = true;
      executionFinished.resolve();
      return true;
    },
  });

  const firstTurn = await runtime.prompt({ query: "first" });
  const secondTurnPromise = runtime.prompt({ query: "second" });
  await waitUntil(() => runtime.isActive());

  const stopResult = runtime.stop();
  const secondTurn = await secondTurnPromise;
  const firstResult = await firstTurn.finished;
  const secondResult = await secondTurn.finished;

  assert.equal(stopRequested, true);
  assert.equal(stopResult.stopped, true);
  assert.equal(stopResult.turnId, firstTurn.id);
  assert.equal(stopResult.cancelledQueuedPrompts, 1);
  assert.equal(firstResult.success, false);
  assert.equal(firstResult.error, "Turn stopped");
  assert.equal(firstResult.text, "partial answer");
  assert.equal(firstResult.assistantMessage.parts[0]?.text, "partial answer");
  assert.equal(secondResult.success, false);
  assert.equal(
    secondResult.error,
    "Prompt cancelled because session was stopped",
  );
  assert.deepEqual(
    events.map((event) => event.type),
    ["start", "start", "finish", "finish"],
  );
});

test("SessionPromptRuntime does not synthesize assistant text when stopped before output", async () => {
  const executionFinished = createDeferred();

  const runtime = new SessionPromptRuntime({
    sessionId: "test",
    publish: () => {},
    createAndPersistUserMessage: async (input) => {
      return createUserMessage(input.query, 1);
    },
    appendErrorMessage: async () => {},
    executeTurn: async (input) => {
      await new Promise((resolve) => {
        input.abortSignal.addEventListener("abort", resolve, { once: true });
      });
      await executionFinished.promise;
      return {
        text: "",
        success: false,
        error: "Turn stopped",
      };
    },
    stopTurn: () => {
      executionFinished.resolve();
      return true;
    },
  });

  const turn = await runtime.prompt({ query: "first" });
  await waitUntil(() => runtime.isActive());

  runtime.stop();
  const result = await turn.finished;

  assert.equal(result.success, false);
  assert.equal(result.error, "Turn stopped");
  assert.equal(result.text, "");
  assert.equal(result.assistantMessage, undefined);
});
