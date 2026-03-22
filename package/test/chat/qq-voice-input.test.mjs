/**
 * QQ 语音附件转写桥接测试（node:test）。
 *
 * 关键点（中文）
 * - 兼容多种 QQ 附件字段命名（attachments/files/file_info/audio/voice）。
 * - 仅 voice/audio 触发语音转写 capability；失败时不中断主流程。
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  buildQqVoiceTranscriptionInstruction,
  extractQqIncomingAttachments,
} from "../../bin/services/chat/channels/qq/VoiceInput.js";

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    log() {},
  };
}

test("extractQqIncomingAttachments supports mixed QQ payload fields", () => {
  const attachments = extractQqIncomingAttachments({
    attachments: [
      {
        id: "att-1",
        filename: "voice-1.ogg",
        content_type: "audio/ogg",
        url: "https://example.com/voice-1.ogg",
      },
    ],
    file_info: JSON.stringify({
      id: "att-2",
      file_name: "photo-1.jpg",
      mime_type: "image/jpeg",
      download_url: "https://example.com/photo-1.jpg",
    }),
    audio: {
      id: "att-3",
      type: "audio",
      url: "https://example.com/audio-1.mp3",
    },
  });

  assert.equal(attachments.length, 3);
  assert.equal(
    attachments.some((item) => item.kind === "voice" && item.attachmentId === "att-1"),
    true,
  );
  assert.equal(
    attachments.some((item) => item.kind === "photo" && item.attachmentId === "att-2"),
    true,
  );
  assert.equal(
    attachments.some((item) => item.kind === "audio" && item.attachmentId === "att-3"),
    true,
  );
});

test("extractQqIncomingAttachments supports string voice/audio fields", () => {
  const attachments = extractQqIncomingAttachments({
    voice: "https://example.com/media/voice-001.ogg",
    audio: "//example.com/media/audio-001.mp3",
  });

  assert.equal(attachments.length, 2);
  assert.equal(
    attachments.some(
      (item) =>
        item.kind === "voice" && item.url === "https://example.com/media/voice-001.ogg",
    ),
    true,
  );
  assert.equal(
    attachments.some(
      (item) => item.kind === "audio" && item.url === "//example.com/media/audio-001.mp3",
    ),
    true,
  );
});

test("voice/audio attachments call capability and produce transcript blocks", async () => {
  const rootPath = "/tmp/demo-root";
  const invokePayloads = [];
  const context = {
    capabilities: {
      has(name) {
        return name === "audio.transcribe";
      },
      async invoke(params) {
        invokePayloads.push(params.payload.audioPath);
        if (params.payload.audioPath.endsWith("a.ogg")) {
          return { success: true, data: { text: "第一段QQ语音" } };
        }
        return { success: true, data: { text: "第二段QQ音频" } };
      },
    },
  };

  const text = await buildQqVoiceTranscriptionInstruction({
    context,
    logger: createLogger(),
    rootPath,
    chatId: "20001",
    messageId: "99",
    chatKey: "qq-group-20001",
    attachments: [
      {
        kind: "voice",
        raw: {},
        localPath: path.join(rootPath, "cache/a.ogg"),
      },
      {
        kind: "audio",
        raw: {},
        localPath: path.join(rootPath, "cache/b.mp3"),
      },
      {
        kind: "photo",
        raw: {},
        localPath: path.join(rootPath, "cache/c.jpg"),
      },
    ],
  });

  assert.equal(invokePayloads.length, 2);
  assert.match(text, /第一段QQ语音/);
  assert.match(text, /第二段QQ音频/);
  assert.match(text, /语音转写/);
});

test("voice capability failure is ignored and returns empty transcript", async () => {
  const context = {
    capabilities: {
      has(name) {
        return name === "audio.transcribe";
      },
      async invoke() {
        return {
          success: false,
          error: "voice capability disabled",
        };
      },
    },
  };

  const text = await buildQqVoiceTranscriptionInstruction({
    context,
    logger: createLogger(),
    rootPath: "/tmp/demo-root",
    chatId: "20001",
    messageId: "99",
    chatKey: "qq-group-20001",
    attachments: [
      {
        kind: "voice",
        raw: {},
        localPath: "/tmp/demo-root/cache/a.ogg",
      },
    ],
  });

  assert.equal(text, "");
});
