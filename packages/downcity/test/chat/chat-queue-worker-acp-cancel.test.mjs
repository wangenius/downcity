/**
 * ChatQueueWorker ACP 取消重跑测试（node:test）。
 *
 * 关键点（中文）
 * - 当 ACP session 正在执行时，新消息入队应立即触发当前 turn cancel。
 * - cancelled 的中间结果不能回发到 channel，也不能写成最终 assistant。
 * - 队列中的后续消息应在下一轮正常执行并输出。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChatQueueWorker } from "../../bin/services/chat/runtime/ChatQueueWorker.js";
import {
  clearChatQueueLane,
  enqueueChatQueue,
} from "../../bin/services/chat/runtime/ChatQueue.js";
import { upsertChatMetaBySessionId } from "../../bin/services/chat/runtime/ChatMetaStore.js";
import {
  getChatSender,
  registerChatSender,
  unregisterChatSender,
} from "../../bin/services/chat/runtime/ChatSendRegistry.js";

const TELEGRAM_CHANNEL = "telegram";

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

test("ChatQueueWorker cancels ACP turn immediately when a newer queued message arrives", { concurrency: false }, async (t) => {
  const laneKey = `telegram-chat-acp-cancel-${Date.now()}`;
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-chat-acp-cancel-"));
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const sentTexts = [];
  const persistedAssistantTexts = [];
  let cancelRequested = false;
  let runCount = 0;
  let cancelCallCount = 0;
  const context = {
    rootPath,
    paths: {
      getDowncityChannelDirPath() {
        return path.join(rootPath, ".downcity", "channel");
      },
      getDowncityChannelMetaPath() {
        return path.join(rootPath, ".downcity", "channel", "meta.json");
      },
    },
    env: {},
    config: {
      services: {
        chat: {},
      },
    },
    plugins: {
      async pipeline(_pointName, value) {
        return value;
      },
      async effect() {},
    },
    session: {
      get(sessionId) {
        return {
          sessionId,
          getExecutor() {
            return runtime;
          },
          async run(params) {
            runCount += 1;
            if (runCount === 1) {
              await waitFor(() => cancelRequested === true);
              return {
                success: true,
                assistantMessage: {
                  id: "a:test:cancelled",
                  role: "assistant",
                  metadata: {
                    v: 1,
                    ts: Date.now(),
                    sessionId,
                    extra: {
                      stopReason: "cancelled",
                    },
                  },
                  parts: [{ type: "text", text: "should-not-send" }],
                },
              };
            }
            return {
              success: true,
              assistantMessage: {
                id: "a:test:final",
                role: "assistant",
                metadata: {
                  v: 1,
                  ts: Date.now(),
                  sessionId,
                },
                parts: [{ type: "text", text: "latest-visible-text" }],
              },
            };
          },
          async appendUserMessage() {},
          async appendAssistantMessage(params) {
            persistedAssistantTexts.push(
              String(params?.message?.parts?.[0]?.text || params?.fallbackText || ""),
            );
          },
          clearExecutor() {},
          getHistoryComposer() {
            return null;
          },
          afterSessionUpdatedAsync() {
            return Promise.resolve();
          },
          isExecuting() {
            return false;
          },
        };
      },
    },
    logger: {
      warn() {},
    },
  };

  clearChatQueueLane(laneKey);
  registerChatSender(TELEGRAM_CHANNEL, {
    async sendText(payload) {
      sentTexts.push(String(payload.text || ""));
      return { success: true };
    },
  });

  const runtime = {
    async requestCancelCurrentTurn() {
      cancelCallCount += 1;
      if (runCount <= 0 || cancelRequested) return false;
      cancelRequested = true;
      return true;
    },
  };

  const worker = new ChatQueueWorker({
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    context,
    config: {
      maxConcurrency: 1,
      mergeDebounceMs: 0,
      mergeMaxWaitMs: 0,
    },
  });

  t.after(() => {
    worker.stop();
    clearChatQueueLane(laneKey);
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    return fs.rm(rootPath, { recursive: true, force: true });
  });

  await upsertChatMetaBySessionId({
    context,
    sessionId: laneKey,
    channel: TELEGRAM_CHANNEL,
    chatId: "acp-cancel-chat",
  });

  worker.start();
  enqueueChatQueue({
    kind: "exec",
    channel: TELEGRAM_CHANNEL,
    targetId: "acp-cancel-chat",
    sessionId: laneKey,
    text: "first message",
    messageId: "5001",
  });

  await waitFor(() => runCount === 1);
  enqueueChatQueue({
    kind: "exec",
    channel: TELEGRAM_CHANNEL,
    targetId: "acp-cancel-chat",
    sessionId: laneKey,
    text: "second message",
    messageId: "5002",
  });

  await waitFor(() => sentTexts.length >= 1);
  await sleep(120);

  assert.equal(cancelCallCount >= 1, true);
  assert.equal(runCount, 2);
  assert.deepEqual(sentTexts, ["latest-visible-text"]);
  assert.deepEqual(persistedAssistantTexts, ["latest-visible-text"]);
});
