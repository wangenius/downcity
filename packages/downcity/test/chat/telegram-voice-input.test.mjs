/**
 * Telegram 入站增强测试（node:test）。
 *
 * 关键点（中文）
 * - 语音附件增强应走 chat augmentInbound pipeline。
 * - voice plugin 只追加 pluginSections，不直接改 service 文本拼装逻辑。
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildChatInboundText } from "../../bin/services/chat/runtime/InboundAugment.js";
import { CHAT_PLUGIN_POINTS } from "../../bin/services/chat/runtime/PluginPoints.js";
import { voicePlugin } from "../../bin/plugins/voice/Plugin.js";

test("voice plugin pipeline augments inbound sections for telegram attachments", async () => {
  const rootPath = "/tmp/demo-root";
  const runtime = {
    rootPath,
    assets: {
      async use(assetName) {
        assert.equal(assetName, "voice.transcriber");
        return {
          async transcribe(payload) {
        if (payload.audioPath.endsWith("a.ogg")) {
          return { text: "第一段语音" };
        }
        return { text: "第二段音频" };
          },
        };
      },
    },
  };
  const handler = voicePlugin.hooks.pipeline[CHAT_PLUGIN_POINTS.augmentInbound][0];

  const next = await handler({
    runtime,
    plugin: "voice",
    value: {
      channel: "telegram",
      chatId: "10001",
      messageId: "88",
      chatKey: "telegram-chat-10001",
      rootPath,
      attachmentText:
        '<file type="voice">cache/a.ogg</file>\n<file type="audio">cache/b.mp3</file>',
      bodyText: "hello",
      pluginSections: [],
      attachments: [
        { channel: "telegram", kind: "voice", path: path.join(rootPath, "cache/a.ogg") },
        { channel: "telegram", kind: "audio", path: path.join(rootPath, "cache/b.mp3") },
        { channel: "telegram", kind: "photo", path: path.join(rootPath, "cache/c.jpg") },
      ],
    },
  });
  const text = buildChatInboundText(next);

  assert.match(text, /第一段语音/);
  assert.match(text, /第二段音频/);
  assert.match(text, /语音转写/);
  assert.match(text, /<file type="voice">/);
  assert.match(text, /hello/);
});

test("voice plugin pipeline ignores resolve failures and keeps base text", async () => {
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
      channel: "telegram",
      chatId: "10001",
      messageId: "88",
      chatKey: "telegram-chat-10001",
      rootPath: "/tmp/demo-root",
      attachmentText: undefined,
      bodyText: "hello",
      pluginSections: [],
      attachments: [
        { channel: "telegram", kind: "voice", path: "/tmp/demo-root/cache/a.ogg" },
      ],
    },
  });

  assert.equal(buildChatInboundText(next), "hello");
});
