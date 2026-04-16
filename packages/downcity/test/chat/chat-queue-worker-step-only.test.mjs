/**
 * ChatQueueWorker step-only 回发测试（node:test）。
 *
 * 覆盖点（中文）
 * - direct 模式下只发送 step 结束文本。
 * - run 结束后的最终 assistant 文本仅在“已有 step 回发”时跳过。
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

test("ChatQueueWorker only dispatches step text when assistant steps already exist", { concurrency: false }, async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-chat-step-only-"));
  const laneKey = `telegram-chat-step-only-${Date.now()}`;
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const sentTexts = [];
  const context = {
    rootPath,
    env: {},
    paths: {
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity/channel"),
      getDowncityChannelMetaPath: () =>
        path.join(rootPath, ".downcity/channel/meta.json"),
      getCacheDirPath: () => path.join(rootPath, ".downcity/.cache"),
    },
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
          async run(params) {
            if (typeof params.onAssistantStepCallback === "function") {
              await params.onAssistantStepCallback({
                text: "internal-reasoning-should-not-send",
                stepIndex: 1,
                visibility: "internal",
              });
              await params.onAssistantStepCallback({
                text: "step-visible-text",
                stepIndex: 2,
                visibility: "visible",
              });
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
                parts: [{ type: "text", text: "final-should-not-send" }],
              },
            };
          },
          async appendUserMessage() {},
          async appendAssistantMessage() {},
          clearExecutor() {},
          getExecutor() {
            return null;
          },
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

  t.after(async () => {
    worker.stop();
    clearChatQueueLane(laneKey);
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  await upsertChatMetaBySessionId({
    context,
    sessionId: laneKey,
    channel: TELEGRAM_CHANNEL,
    chatId: "step-only-chat",
  });

  worker.start();
  enqueueChatQueue({
    kind: "exec",
    channel: TELEGRAM_CHANNEL,
    targetId: "step-only-chat",
    sessionId: laneKey,
    text: "run once",
    messageId: "3001",
  });

  await waitFor(() => sentTexts.length >= 1);
  await sleep(120);

  assert.deepEqual(sentTexts, ["step-visible-text"]);
});

test("ChatQueueWorker dispatches step text through channel path when direct step send cannot deliver", { concurrency: false }, async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-chat-step-fallback-"));
  const laneKey = `telegram-chat-step-fallback-${Date.now()}`;
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const sentPayloads = [];
  const context = {
    rootPath,
    env: {},
    paths: {
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity/channel"),
      getDowncityChannelMetaPath: () =>
        path.join(rootPath, ".downcity/channel/meta.json"),
      getCacheDirPath: () => path.join(rootPath, ".downcity/.cache"),
    },
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
          async run(params) {
            if (typeof params.onAssistantStepCallback === "function") {
              await params.onAssistantStepCallback({
                text: "step-visible-text",
                stepIndex: 1,
              });
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
                parts: [{ type: "text", text: "final-should-not-send" }],
              },
            };
          },
          async appendUserMessage() {},
          async appendAssistantMessage() {},
          clearExecutor() {},
          getExecutor() {
            return null;
          },
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
      sentPayloads.push(payload);
      if (payload.replyToMessage === true && payload.messageId === "3101") {
        return { success: true };
      }
      return { success: false, error: "step direct send requires reply context" };
    },
  });

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

  t.after(async () => {
    worker.stop();
    clearChatQueueLane(laneKey);
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  await upsertChatMetaBySessionId({
    context,
    sessionId: laneKey,
    channel: TELEGRAM_CHANNEL,
    chatId: "step-fallback-chat",
  });

  worker.start();
  enqueueChatQueue({
    kind: "exec",
    channel: TELEGRAM_CHANNEL,
    targetId: "step-fallback-chat",
    sessionId: laneKey,
    text: "run once",
    messageId: "3101",
  });

  await waitFor(() =>
    sentPayloads.some((payload) => String(payload.text || "") === "step-visible-text" && payload.replyToMessage === true),
  );
  await sleep(120);

  assert.deepEqual(
    sentPayloads.map((payload) => ({
      text: String(payload.text || ""),
      replyToMessage: payload.replyToMessage === true,
      messageId: String(payload.messageId || ""),
    })),
    [
      {
        text: "step-visible-text",
        replyToMessage: false,
        messageId: "",
      },
      {
        text: "step-visible-text",
        replyToMessage: true,
        messageId: "3101",
      },
    ],
  );
});

test("ChatQueueWorker dispatches final assistant text when no assistant step was emitted", { concurrency: false }, async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-chat-final-send-"));
  const laneKey = `telegram-chat-final-send-${Date.now()}`;
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const sentTexts = [];
  const appendedAssistantTexts = [];
  const context = {
    rootPath,
    env: {},
    paths: {
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity/channel"),
      getDowncityChannelMetaPath: () =>
        path.join(rootPath, ".downcity/channel/meta.json"),
      getCacheDirPath: () => path.join(rootPath, ".downcity/.cache"),
    },
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
          async run() {
            return {
              success: true,
              assistantMessage: {
                id: "a:test:final-only",
                role: "assistant",
                metadata: {
                  v: 1,
                  ts: Date.now(),
                  sessionId,
                },
                parts: [{ type: "text", text: "final-visible-text" }],
              },
            };
          },
          async appendUserMessage() {},
          async appendAssistantMessage(params) {
            appendedAssistantTexts.push(String(params?.message?.parts?.[0]?.text || params?.fallbackText || ""));
          },
          clearExecutor() {},
          getExecutor() {
            return null;
          },
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

  t.after(async () => {
    worker.stop();
    clearChatQueueLane(laneKey);
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  await upsertChatMetaBySessionId({
    context,
    sessionId: laneKey,
    channel: TELEGRAM_CHANNEL,
    chatId: "final-only-chat",
  });

  worker.start();
  enqueueChatQueue({
    kind: "exec",
    channel: TELEGRAM_CHANNEL,
    targetId: "final-only-chat",
    sessionId: laneKey,
    text: "run final only",
    messageId: "4001",
  });

  await waitFor(() => sentTexts.length >= 1);
  await sleep(120);

  assert.deepEqual(sentTexts, ["final-visible-text"]);
  assert.deepEqual(appendedAssistantTexts, ["final-visible-text"]);
});
