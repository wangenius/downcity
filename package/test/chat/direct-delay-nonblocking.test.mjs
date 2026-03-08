/**
 * direct delay 非阻塞调度测试（node:test）。
 *
 * 关键点（中文）
 * - `nonBlockingDelay=true` 时应立即返回，实际发送由后台延迟调度。
 * - 默认行为仍应阻塞等待，避免破坏 `chat send` 既有语义。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { sendChatTextByChatKey } from "../../bin/services/chat/Action.js";
import {
  getChatSender,
  registerChatSender,
  unregisterChatSender,
} from "../../bin/services/chat/runtime/ChatSendRegistry.js";

const TELEGRAM_CHANNEL = "telegram";
const CHAT_KEY = "telegram-chat-10001";

function buildRuntime() {
  return {
    rootPath: "",
    logger: {
      warn() {},
    },
  };
}

test("sendChatTextByChatKey schedules delayed send without blocking when nonBlockingDelay=true", async () => {
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
    const start = Date.now();
    const result = await sendChatTextByChatKey({
      context: buildRuntime(),
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
  }
});

test("sendChatTextByChatKey keeps blocking behavior by default", async () => {
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
    const start = Date.now();
    const result = await sendChatTextByChatKey({
      context: buildRuntime(),
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
  }
});
