/**
 * Telegram 附件 video 能力测试（node:test）。
 *
 * 关键点（中文）
 * - `<file type="video">...` 能被正确解析。
 * - direct 模式会保留 `<file>` 协议，交给渠道出站阶段处理。
 * - 常见视频扩展名可推断 MIME，避免上传时类型缺失。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  guessMimeType,
  parseTelegramAttachments,
} from "../../bin/services/chat/channels/telegram/Shared.js";
import { TelegramApiClient } from "../../bin/services/chat/channels/telegram/ApiClient.js";
import { parseDirectDispatchAssistantText } from "../../bin/services/chat@/city/runtime/console/DirectDispatchParser.js";

test("parseTelegramAttachments supports video type", () => {
  const parsed = parseTelegramAttachments(
    [
      "请看视频并总结",
      '<file type="video" caption="演示视频">assets/demo.mp4</file>',
      '<file type="photo" caption="封面图">assets/cover.png</file>',
    ].join("\n"),
  );

  assert.equal(parsed.text, "请看视频并总结");
  assert.equal(parsed.attachments.length, 2);
  assert.deepEqual(parsed.attachments[0], {
    type: "video",
    pathOrUrl: "assets/demo.mp4",
    caption: "演示视频",
  });
  assert.deepEqual(parsed.attachments[1], {
    type: "photo",
    pathOrUrl: "assets/cover.png",
    caption: "封面图",
  });
  assert.deepEqual(parsed.segments, [
    {
      kind: "text",
      text: "请看视频并总结",
    },
    {
      kind: "attachment",
      attachment: {
        type: "video",
        pathOrUrl: "assets/demo.mp4",
        caption: "演示视频",
      },
    },
    {
      kind: "attachment",
      attachment: {
        type: "photo",
        pathOrUrl: "assets/cover.png",
        caption: "封面图",
      },
    },
  ]);
});

test("parseDirectDispatchAssistantText keeps <file> tags for channel parsing", () => {
  const plan = parseDirectDispatchAssistantText({
    fallbackChatKey: "telegram-chat-10001",
    assistantText: `本次结果如下
<file type="video">assets/output/demo.mp4</file>`,
  });

  assert.ok(plan, "expected non-null direct dispatch plan");
  assert.ok(plan.text, "expected text plan");
  assert.equal(
    plan.text.text,
    '本次结果如下\n\n<file type="video">assets/output/demo.mp4</file>',
  );
});

test("parseDirectDispatchAssistantText preserves interleaved text and file order", () => {
  const plan = parseDirectDispatchAssistantText({
    fallbackChatKey: "telegram-chat-10001",
    assistantText: [
      "第一段",
      '<file type="document">reports/a.pdf</file>',
      "第二段",
      '<file type="photo">assets/b.png</file>',
    ].join("\n\n"),
  });

  assert.ok(plan?.text);
  assert.equal(
    plan.text.text,
    [
      "第一段",
      '<file type="document">reports/a.pdf</file>',
      "第二段",
      '<file type="photo">assets/b.png</file>',
    ].join("\n\n"),
  );
});

test("guessMimeType covers common video extensions", () => {
  assert.equal(guessMimeType("demo.mp4"), "video/mp4");
  assert.equal(guessMimeType("demo.mov"), "video/quicktime");
  assert.equal(guessMimeType("demo.webm"), "video/webm");
  assert.equal(guessMimeType("demo.m4v"), "video/x-m4v");
});

test("TelegramApiClient sends text and attachments in original order", async () => {
  const client = new TelegramApiClient({
    botToken: "token",
    projectRoot: process.cwd(),
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
  });
  const calls = [];
  client.requestJson = async (method, data) => {
    calls.push({
      kind: "text",
      method,
      text: data.text,
    });
    return {};
  };
  client.sendAttachment = async (_chatId, attachment) => {
    calls.push({
      kind: "attachment",
      type: attachment.type,
      pathOrUrl: attachment.pathOrUrl,
      caption: attachment.caption,
    });
  };

  await client.sendMessage(
    "10001",
    [
      "第一段",
      '<file type="document" caption="文档">reports/a.pdf</file>',
      "第二段",
      '<file type="photo" caption="预览图">assets/b.png</file>',
      "第三段",
    ].join("\n\n"),
  );

  assert.deepEqual(calls, [
    { kind: "text", method: "sendMessage", text: "第一段" },
    {
      kind: "attachment",
      type: "document",
      pathOrUrl: "reports/a.pdf",
      caption: "文档",
    },
    { kind: "text", method: "sendMessage", text: "第二段" },
    {
      kind: "attachment",
      type: "photo",
      pathOrUrl: "assets/b.png",
      caption: "预览图",
    },
    { kind: "text", method: "sendMessage", text: "第三段" },
  ]);
});
