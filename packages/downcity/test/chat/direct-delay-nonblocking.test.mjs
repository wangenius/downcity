/**
 * direct delay 非阻塞调度测试（node:test）。
 *
 * 关键点（中文）
 * - `nonBlockingDelay=true` 时应立即返回，实际发送由后台延迟调度。
 * - 默认行为仍应阻塞等待，避免破坏 `chat send` 既有语义。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { sendChatTextByChatKey } from "../../bin/services/chat/Action.js";
import { upsertChatMetaBySessionId } from "../../bin/services/chat/runtime/ChatMetaStore.js";
import {
  getChatSender,
  registerChatSender,
  unregisterChatSender,
} from "../../bin/services/chat/runtime/ChatSendRegistry.js";

const TELEGRAM_CHANNEL = "telegram";
const CHAT_KEY = "ctx_direct_delay";

function buildRuntime(rootPath) {
  return {
    rootPath,
    env: {},
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
    },
  };
}

test("sendChatTextByChatKey schedules delayed send without blocking when nonBlockingDelay=true", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-direct-delay-"));
  const runtime = buildRuntime(rootPath);
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const calls = [];
  registerChatSender(TELEGRAM_CHANNEL, {
    async sendText(payload) {
      calls.push({
        ts: Date.now(),
        payload,
      });
      return { success: true };
    },
  });

  try {
    await upsertChatMetaBySessionId({
      context: runtime,
      sessionId: CHAT_KEY,
      channel: TELEGRAM_CHANNEL,
      chatId: "10001",
    });

    const start = Date.now();
    const result = await sendChatTextByChatKey({
      context: runtime,
      chatKey: CHAT_KEY,
      text: "delayed-message",
      delayMs: 120,
      nonBlockingDelay: true,
    });
    const elapsedMs = Date.now() - start;

    assert.equal(result.success, true);
    assert.equal(result.chatKey, CHAT_KEY);
    assert.equal(calls.length, 0);
    assert.ok(
      elapsedMs < 80,
      `expected non-blocking return (<80ms), got ${elapsedMs}ms`,
    );

    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.chatId, "10001");
    assert.equal(calls[0].payload.text, "delayed-message");
  } finally {
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});

test("sendChatTextByChatKey keeps blocking behavior by default", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-direct-delay-"));
  const runtime = buildRuntime(rootPath);
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const calls = [];
  registerChatSender(TELEGRAM_CHANNEL, {
    async sendText(payload) {
      calls.push({
        ts: Date.now(),
        payload,
      });
      return { success: true };
    },
  });

  try {
    await upsertChatMetaBySessionId({
      context: runtime,
      sessionId: CHAT_KEY,
      channel: TELEGRAM_CHANNEL,
      chatId: "10001",
    });

    const start = Date.now();
    const result = await sendChatTextByChatKey({
      context: runtime,
      chatKey: CHAT_KEY,
      text: "blocking-message",
      delayMs: 120,
    });
    const elapsedMs = Date.now() - start;

    assert.equal(result.success, true);
    assert.equal(result.chatKey, CHAT_KEY);
    assert.equal(calls.length, 1);
    assert.ok(
      elapsedMs >= 90,
      `expected blocking return (>=90ms), got ${elapsedMs}ms`,
    );
  } finally {
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
