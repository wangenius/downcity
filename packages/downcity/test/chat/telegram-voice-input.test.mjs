/**
 * Telegram 入站增强测试（node:test）。
 *
 * 关键点（中文）
 * - 语音附件增强应走 chat augmentInbound pipeline。
 * - asr plugin 只追加 pluginSections，不直接改 service 文本拼装逻辑。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildChatInboundText } from "../../bin/services/chat@/city/runtime/console/InboundAugment.js";
import { CHAT_PLUGIN_POINTS } from "../../bin/services/chat@/city/runtime/console/PluginPoints.js";
import { asrPlugin } from "../../bin/plugins/asr/Plugin.js";

test("asr plugin pipeline augments inbound sections for telegram attachments", async () => {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-voice-telegram-"));
  fs.mkdirSync(path.join(rootPath, "cache"), { recursive: true });
  fs.writeFileSync(path.join(rootPath, "cache/a.ogg"), "");
  fs.writeFileSync(path.join(rootPath, "cache/b.mp3"), "");
  const runtime = {
    rootPath,
    config: {
      plugins: {
        asr: {
          enabled: true,
          provider: "command",
          command: "printf '统一转写文本\\n'",
        },
      },
    },
  };
  const handler = asrPlugin.hooks.pipeline[CHAT_PLUGIN_POINTS.augmentInbound][0];

  const next = await handler({
    context: runtime,
    plugin: "asr",
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

  assert.match(text, /统一转写文本/);
  assert.match(text, /语音转写/);
  assert.match(text, /<file type="voice">/);
  assert.match(text, /hello/);
});

test("asr plugin pipeline ignores resolve failures and keeps base text", async () => {
  const handler = asrPlugin.hooks.pipeline[CHAT_PLUGIN_POINTS.augmentInbound][0];
  const next = await handler({
    context: {
      rootPath: "/tmp/demo-root",
      config: {
        plugins: {
          asr: {
            enabled: false,
          },
        },
      },
    },
    plugin: "asr",
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
