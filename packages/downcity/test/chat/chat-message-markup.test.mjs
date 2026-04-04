/**
 * Chat 消息协议测试（node:test）。
 *
 * 关键点（中文）
 * - `<file>` 是统一附件协议。
 * - frontmatter metadata 应按 `chat send` 参数语义解析。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatMessageText,
  parseChatMessageMarkup,
} from "../../bin/services/chat@/city/runtime/console/ChatMessageMarkup.js";
import { parseChatSendOptionsFromMetadata } from "../../bin/services/chat@/city/runtime/console/ChatSendMetadata.js";

test("parseChatMessageMarkup extracts frontmatter and file tags", () => {
  const parsed = parseChatMessageMarkup(`---
chatKey: ctx_demo
reply: true
messageId: "88"
---
总结如下
<file type="document" caption="日报">reports/daily.md</file>`);

  assert.equal(parsed.bodyText, "总结如下");
  assert.equal(parsed.files.length, 1);
  assert.deepEqual(parsed.files[0], {
    type: "document",
    path: "reports/daily.md",
    caption: "日报",
  });
  assert.equal(parsed.metadata.chatKey, "ctx_demo");
  assert.deepEqual(parsed.segments, [
    {
      kind: "text",
      text: "总结如下",
    },
    {
      kind: "file",
      file: {
        type: "document",
        path: "reports/daily.md",
        caption: "日报",
      },
    },
  ]);
});

test("buildChatMessageText normalizes body plus file tags", () => {
  assert.equal(
    buildChatMessageText({
      bodyText: "请查看附件",
      files: [
        {
          type: "video",
          path: "assets/demo.mp4",
          caption: "演示视频",
        },
      ],
    }),
    '请查看附件\n\n<file type="video" caption="演示视频">assets/demo.mp4</file>',
  );
});

test("parseChatMessageMarkup preserves text and file order", () => {
  const parsed = parseChatMessageMarkup([
    "第一段",
    '<file type="document">reports/a.pdf</file>',
    "第二段",
    '<file type="photo">assets/b.png</file>',
    "第三段",
  ].join("\n\n"));

  assert.deepEqual(parsed.segments, [
    { kind: "text", text: "第一段" },
    {
      kind: "file",
      file: {
        type: "document",
        path: "reports/a.pdf",
      },
    },
    { kind: "text", text: "第二段" },
    {
      kind: "file",
      file: {
        type: "photo",
        path: "assets/b.png",
      },
    },
    { kind: "text", text: "第三段" },
  ]);
  assert.equal(
    buildChatMessageText({ segments: parsed.segments }),
    [
      "第一段",
      '<file type="document">reports/a.pdf</file>',
      "第二段",
      '<file type="photo">assets/b.png</file>',
      "第三段",
    ].join("\n\n"),
  );
});

test("parseChatSendOptionsFromMetadata aligns with chat send params", () => {
  const options = parseChatSendOptionsFromMetadata({
    metadata: {
      chatKey: "ctx_demo",
      delay: 3000,
      reply: true,
      messageId: "88",
    },
    strict: true,
  });

  assert.deepEqual(options, {
    chatKey: "ctx_demo",
    delayMs: 3000,
    replyToMessage: true,
    messageId: "88",
  });
});
