/**
 * Telegram 语音附件转写桥接测试（node:test）。
 *
 * 关键点（中文）
 * - 仅 voice/audio 附件会触发 extension 调用。
 * - extension 失败时不中断主流程（返回空文本）。
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildTelegramVoiceTranscriptionInstruction } from "../../bin/services/chat/channels/telegram/VoiceInput.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    log() {},
  };
}

test("voice/audio attachments call extension and produce transcript blocks", async () => {
  const rootPath = "/tmp/demo-root";
  const context = {
    extensions: {
      async invoke(params) {
        if (params.payload.audioPath.endsWith("a.ogg")) {
          return { success: true, data: { text: "第一段语音" } };
        }
        return { success: true, data: { text: "第二段音频" } };
      },
    },
  };

  const text = await buildTelegramVoiceTranscriptionInstruction({
    context,
    logger: createLogger(),
    rootPath,
    chatId: "10001",
    messageId: "88",
    chatKey: "telegram-chat-10001",
    attachments: [
      { type: "voice", path: path.join(rootPath, "cache/a.ogg") },
      { type: "audio", path: path.join(rootPath, "cache/b.mp3") },
      { type: "photo", path: path.join(rootPath, "cache/c.jpg") },
    ],
  });

  assert.match(text, /第一段语音/);
  assert.match(text, /第二段音频/);
  assert.match(text, /语音转写/);
});

test("extension failure is ignored and returns empty transcript", async () => {
  const context = {
    extensions: {
      async invoke() {
        return {
          success: false,
          error: "voice extension disabled",
        };
      },
    },
  };

  const text = await buildTelegramVoiceTranscriptionInstruction({
    context,
    logger: createLogger(),
    rootPath: "/tmp/demo-root",
    chatId: "10001",
    messageId: "88",
    chatKey: "telegram-chat-10001",
    attachments: [{ type: "voice", path: "/tmp/demo-root/cache/a.ogg" }],
  });

  assert.equal(text, "");
});
