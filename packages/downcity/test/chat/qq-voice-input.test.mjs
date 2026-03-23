/**
 * QQ 语音附件转写桥接测试（node:test）。
 *
 * 关键点（中文）
 * - 兼容多种 QQ 附件字段命名（attachments/files/file_info/audio/voice）。
 * - 语音增强应通过 augmentInbound pipeline 完成。
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  extractQqIncomingAttachments,
  resolveQqAttachmentLocalPath,
} from "../../bin/services/chat/channels/qq/VoiceInput.js";
import { buildChatInboundText } from "../../bin/services/chat/runtime/InboundAugment.js";
import { CHAT_PLUGIN_POINTS } from "../../bin/services/chat/runtime/PluginPoints.js";
import { voicePlugin } from "../../bin/plugins/voice/Plugin.js";

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

test("resolveQqAttachmentLocalPath reuses local path", async () => {
  const rootPath = "/tmp/demo-root";
  const localPath = await resolveQqAttachmentLocalPath({
    rootPath,
    attachment: {
      kind: "voice",
      raw: {},
      localPath: path.join(rootPath, "cache/a.ogg"),
    },
  });
  assert.equal(localPath, path.join(rootPath, "cache/a.ogg"));
});

test("voice plugin pipeline augments inbound sections for qq attachments", async () => {
  const rootPath = "/tmp/demo-root";
  const invokePayloads = [];
  const handler = voicePlugin.hooks.pipeline[CHAT_PLUGIN_POINTS.augmentInbound][0];
  const next = await handler({
    runtime: {
      rootPath,
      assets: {
        async use(assetName) {
          assert.equal(assetName, "voice.transcriber");
          return {
            async transcribe(payload) {
              invokePayloads.push(payload.audioPath);
              if (payload.audioPath.endsWith("a.ogg")) {
                return { text: "第一段QQ语音" };
              }
              return { text: "第二段QQ音频" };
            },
          };
        },
      },
    },
    plugin: "voice",
    value: {
      channel: "qq",
      chatId: "20001",
      messageId: "99",
      chatKey: "qq-group-20001",
      rootPath,
      bodyText: "hello",
      pluginSections: [],
      attachments: [
        {
          channel: "qq",
          kind: "voice",
          path: path.join(rootPath, "cache/a.ogg"),
        },
        {
          channel: "qq",
          kind: "audio",
          path: path.join(rootPath, "cache/b.mp3"),
        },
        {
          channel: "qq",
          kind: "photo",
          path: path.join(rootPath, "cache/c.jpg"),
        },
      ],
    },
  });
  const text = buildChatInboundText(next);

  assert.equal(invokePayloads.length, 2);
  assert.match(text, /第一段QQ语音/);
  assert.match(text, /第二段QQ音频/);
  assert.match(text, /语音转写/);
});

test("voice plugin pipeline ignores resolve failures for qq attachments", async () => {
  const handler = voicePlugin.hooks.pipeline[CHAT_PLUGIN_POINTS.augmentInbound][0];
  const next = await handler({
    runtime: {
      rootPath: "/tmp/demo-root",
      assets: {
        async use() {
          throw new Error("voice plugin disabled");
        },
      },
    },
    plugin: "voice",
    value: {
      channel: "qq",
      chatId: "20001",
      messageId: "99",
      chatKey: "qq-group-20001",
      rootPath: "/tmp/demo-root",
      bodyText: "hello",
      pluginSections: [],
      attachments: [
        {
          channel: "qq",
          kind: "voice",
          path: "/tmp/demo-root/cache/a.ogg",
        },
      ],
    },
  });

  assert.equal(buildChatInboundText(next), "hello");
});
