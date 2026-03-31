/**
 * ChatQueueWorker step-only 回发测试（node:test）。
 *
 * 覆盖点（中文）
 * - direct 模式下只发送 step 结束文本。
 * - run 结束后的最终 assistant 文本不再额外回发。
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

test("ChatQueueWorker only dispatches step text and never sends final assistant text", { concurrency: false }, async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-chat-step-only-"));
  const laneKey = `telegram-chat-step-only-${Date.now()}`;
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const sentTexts = [];
  const context = {
    rootPath,
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
              sessionId: params.sessionId,
            },
            parts: [{ type: "text", text: "final-should-not-send" }],
          },
        };
      },
      async appendUserMessage() {},
      async appendAssistantMessage() {},
      clearRuntime() {},
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
