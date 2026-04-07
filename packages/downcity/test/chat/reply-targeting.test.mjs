/**
 * chat reply 目标绑定测试（node:test）。
 *
 * 关键点（中文）
 * - 当前请求上下文显式 reply 时，应优先绑定触发这次 run 的 messageId。
 * - 飞书普通发送即使携带 messageId，也不能自动退化成平台 reply。
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
import { FeishuBot } from "../../bin/services/chat/channels/feishu/Feishu.js";

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

test("sendChatTextByChatKey locks reply target to current request message id", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-reply-target-"));
  const runtime = buildRuntime(rootPath);
  const previous = getChatSender("telegram");
  const calls = [];

  registerChatSender("telegram", {
    async sendText(payload) {
      calls.push(payload);
      return { success: true };
    },
  });

  await upsertChatMetaBySessionId({
    context: runtime,
    sessionId: "ctx_reply_lock",
    channel: "telegram",
    chatId: "chat-1",
    messageId: "latest-meta-message",
  });

  const previousEnv = {
    chatKey: process.env.DC_CTX_CHAT_KEY,
    messageId: process.env.DC_CTX_MESSAGE_ID,
  };

  process.env.DC_CTX_CHAT_KEY = "ctx_reply_lock";
  process.env.DC_CTX_MESSAGE_ID = "trigger-message";

  try {
    const result = await sendChatTextByChatKey({
      context: runtime,
      chatKey: "ctx_reply_lock",
      text: "reply payload",
      replyToMessage: true,
    });

    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].messageId, "trigger-message");
    assert.equal(calls[0].replyToMessage, true);
  } finally {
    if (previous) {
      registerChatSender("telegram", previous);
    } else {
      unregisterChatSender("telegram");
    }

    if (previousEnv.chatKey === undefined) {
      delete process.env.DC_CTX_CHAT_KEY;
    } else {
      process.env.DC_CTX_CHAT_KEY = previousEnv.chatKey;
    }
    if (previousEnv.messageId === undefined) {
      delete process.env.DC_CTX_MESSAGE_ID;
    } else {
      process.env.DC_CTX_MESSAGE_ID = previousEnv.messageId;
    }

    await fs.rm(rootPath, { recursive: true, force: true });
  }
});

test("FeishuBot only replies when replyToMessage is explicitly enabled", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-feishu-reply-"));
  const runtime = buildRuntime(rootPath);
  const bot = new FeishuBot(runtime, "app-id", "app-secret", undefined);

  const calls = [];
  bot.sendMessage = async (chatId, chatType, messageId, text) => {
    calls.push({
      kind: "reply",
      chatId,
      chatType,
      messageId,
      text,
    });
  };
  bot.sendChatMessage = async (chatId, chatType, text) => {
    calls.push({
      kind: "create",
      chatId,
      chatType,
      text,
    });
  };

  try {
    await bot.sendTextToPlatform({
      chatId: "oc_xxx",
      chatType: "group",
      messageId: "msg-latest",
      text: "plain send",
    });
    await bot.sendTextToPlatform({
      chatId: "oc_xxx",
      chatType: "group",
      messageId: "msg-trigger",
      text: "explicit reply",
      replyToMessage: true,
    });

    assert.deepEqual(calls, [
      {
        kind: "create",
        chatId: "oc_xxx",
        chatType: "group",
        text: "plain send",
      },
      {
        kind: "reply",
        chatId: "oc_xxx",
        chatType: "group",
        messageId: "msg-trigger",
        text: "explicit reply",
      },
    ]);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
