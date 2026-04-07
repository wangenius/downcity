/**
 * chat send service action 定时调度测试（node:test）。
 *
 * 关键点（中文）
 * - `city chat send --time/--delay` 走 service action 时应立即返回。
 * - 实际发送由 runtime 后台定时器在内存中调度，不再阻塞 HTTP/CLI 调用。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ChatService } from "../../bin/services/chat/ChatService.js";
import { upsertChatMetaBySessionId } from "../../bin/services/chat/runtime/ChatMetaStore.js";
import {
  getChatSender,
  registerChatSender,
  unregisterChatSender,
} from "../../bin/services/chat/runtime/ChatSendRegistry.js";

const TELEGRAM_CHANNEL = "telegram";
const CHAT_KEY = "ctx_service_action_schedule";

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

function buildRuntime(rootPath) {
  return {
    rootPath,
    env: {},
    paths: {
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity/channel"),
      getDowncityChannelMetaPath: () =>
        path.join(rootPath, ".downcity/channel/meta.json"),
      getCacheDirPath: () => path.join(rootPath, ".downcity/.cache"),
    },
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
    },
  };
}

test("chat send service action schedules sendAtMs without blocking", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-chat-send-action-"),
  );
  const runtime = buildRuntime(rootPath);
  const chatService = new ChatService(null);
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

    const targetTs = Date.now() + 120;
    const start = Date.now();
    const result = await chatService.actions.send.execute({
      context: runtime,
      payload: {
        chatKey: CHAT_KEY,
        text: "scheduled-message",
        sendAtMs: targetTs,
      },
      serviceName: "chat",
      actionName: "send",
    });
    const elapsedMs = Date.now() - start;

    assert.equal(result.success, true);
    assert.deepEqual(result.data, { chatKey: CHAT_KEY });
    assert.equal(calls.length, 0);
    assert.ok(
      elapsedMs < 140,
      `expected service action to return quickly (<140ms), got ${elapsedMs}ms`,
    );

    await waitFor(() => calls.length === 1, 2_000, 20);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.chatId, "10001");
    assert.equal(calls[0].payload.text, "scheduled-message");
    assert.ok(
      calls[0].ts >= targetTs - 20,
      `expected send at or after scheduled time, got ${calls[0].ts} < ${targetTs}`,
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
