/**
 * ChatQueueWorker 启动前消息合并测试（node:test）。
 *
 * 覆盖点（中文）
 * - 默认合并窗口下：连续两条 exec 消息应在一次 run 前并入上下文。
 * - 关闭合并窗口后：两条消息应分别触发两次 run。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ChatQueueWorker } from "../../bin/services/chat/runtime/ChatQueueWorker.js";
import {
  clearChatQueueLane,
  enqueueChatQueue,
} from "../../bin/services/chat/runtime/ChatQueue.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs = 2_000, intervalMs = 10) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (check()) return;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms`);
}

function createWorkerHarness(queueConfig) {
  const runCalls = [];
  const appendedUserMessages = [];

  const worker = new ChatQueueWorker({
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    context: {
      config: {
        services: {
          chat: {
            method: "cmd",
          },
        },
      },
      context: {
        async run(params) {
          runCalls.push({
            contextId: params.contextId,
            query: params.query,
            ts: Date.now(),
          });
          return {
            success: true,
            assistantMessage: null,
          };
        },
        async appendUserMessage(params) {
          appendedUserMessages.push({
            contextId: params.contextId,
            text: params.text,
          });
        },
        async appendAssistantMessage() {},
        clearAgent() {},
      },
      logger: {
        warn() {},
      },
    },
    config: queueConfig,
  });

  return {
    worker,
    runCalls,
    appendedUserMessages,
  };
}

function enqueueExec(params) {
  enqueueChatQueue({
    kind: "exec",
    channel: "telegram",
    targetId: "chat-merge-test",
    contextId: params.laneKey,
    text: params.text,
    messageId: params.messageId,
  });
}

test("ChatQueueWorker batches consecutive inbound messages into one run by debounce window", async (t) => {
  const laneKey = `telegram-chat-merge-${Date.now()}-a`;
  clearChatQueueLane(laneKey);

  const { worker, runCalls, appendedUserMessages } = createWorkerHarness({
    maxConcurrency: 1,
    mergeDebounceMs: 100,
    mergeMaxWaitMs: 600,
  });
  worker.start();
  t.after(() => {
    worker.stop();
    clearChatQueueLane(laneKey);
  });

  const firstText = "first inbound";
  const secondText = "second inbound";
  const firstEnqueueAt = Date.now();

  enqueueExec({ laneKey, text: firstText, messageId: "1001" });
  await sleep(30);
  enqueueExec({ laneKey, text: secondText, messageId: "1002" });

  await waitFor(() => runCalls.length >= 1);
  await sleep(220);

  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0].query, secondText);
  assert.ok(
    runCalls[0].ts - firstEnqueueAt >= 70,
    "run should wait for burst debounce before start",
  );
  assert.deepEqual(
    appendedUserMessages.map((item) => item.text),
    [firstText, secondText],
  );
});

test("ChatQueueWorker runs immediately when burst merge is disabled", async (t) => {
  const laneKey = `telegram-chat-merge-${Date.now()}-b`;
  clearChatQueueLane(laneKey);

  const { worker, runCalls, appendedUserMessages } = createWorkerHarness({
    maxConcurrency: 1,
    mergeDebounceMs: 0,
    mergeMaxWaitMs: 0,
  });
  worker.start();
  t.after(() => {
    worker.stop();
    clearChatQueueLane(laneKey);
  });

  const firstText = "first immediate";
  const secondText = "second immediate";

  enqueueExec({ laneKey, text: firstText, messageId: "2001" });
  await sleep(30);
  enqueueExec({ laneKey, text: secondText, messageId: "2002" });

  await waitFor(() => runCalls.length >= 2);

  assert.deepEqual(
    runCalls.map((item) => item.query),
    [firstText, secondText],
  );
  assert.deepEqual(
    appendedUserMessages.map((item) => item.text),
    [firstText, secondText],
  );
});
