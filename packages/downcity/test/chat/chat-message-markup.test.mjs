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
} from "../../bin/services/chat/runtime/ChatMessageMarkup.js";
import { parseChatSendOptionsFromMetadata } from "../../bin/services/chat/runtime/ChatSendMetadata.js";

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
