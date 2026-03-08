/**
 * Telegram 附件 video 能力测试（node:test）。
 *
 * 关键点（中文）
 * - `@attach video ...` 能被正确解析。
 * - direct `<file type="video">` 会被转换为 `@attach video ...`。
 * - 常见视频扩展名可推断 MIME，避免上传时类型缺失。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  guessMimeType,
  parseTelegramAttachments,
} from "../../bin/services/chat/channels/telegram/Shared.js";
import { parseDirectDispatchAssistantText } from "../../bin/services/chat/runtime/DirectDispatchParser.js";

test("parseTelegramAttachments supports video type", () => {
  const parsed = parseTelegramAttachments(
    [
      "请看视频并总结",
      "@attach video assets/demo.mp4 | 演示视频",
      "@attach photo assets/cover.png | 封面图",
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
});

test("parseDirectDispatchAssistantText converts <file type=video> to @attach video", () => {
  const plan = parseDirectDispatchAssistantText({
    fallbackChatKey: "telegram-chat-10001",
    assistantText: `本次结果如下
<file type="video">assets/output/demo.mp4</file>`,
  });

  assert.ok(plan, "expected non-null direct dispatch plan");
  assert.ok(plan.text, "expected text plan");
  assert.equal(
    plan.text.text,
    "本次结果如下\n\n@attach video assets/output/demo.mp4",
  );
});

test("guessMimeType covers common video extensions", () => {
  assert.equal(guessMimeType("demo.mp4"), "video/mp4");
  assert.equal(guessMimeType("demo.mov"), "video/quicktime");
  assert.equal(guessMimeType("demo.webm"), "video/webm");
  assert.equal(guessMimeType("demo.m4v"), "video/x-m4v");
});

