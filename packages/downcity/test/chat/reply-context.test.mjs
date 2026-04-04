/**
 * chat reply 引用上下文测试（node:test）。
 *
 * 关键点（中文）
 * - Telegram reply 要能把被引用消息正文和 quote 片段提取出来。
 * - Feishu 父消息回查结果要能归一化为可执行正文。
 * - 格式化器在“当前正文为空”时也不能丢掉 reply 内容。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { extractTelegramReplyContext } from "../../bin/services/chat/channels/telegram/ReplyContext.js";
import { buildFeishuReplyContext } from "../../bin/services/chat/channels/feishu/ReplyContext.js";
import {
  buildReplyContextExtra,
  buildReplyContextInstruction,
} from "../../bin/services/chat@/city/runtime/console/ReplyContextFormatter.js";

test("extractTelegramReplyContext keeps replied text and explicit quote", () => {
  const replyContext = extractTelegramReplyContext({
    text: "请你继续处理这个问题",
    quote: {
      text: "继续处理",
    },
    reply_to_message: {
      message_id: 321,
      text: "请帮我总结一下今天的报警和影响范围",
      from: {
        id: 1001,
        first_name: "Alice",
      },
    },
  });

  assert.deepEqual(replyContext, {
    messageId: "321",
    actorName: "Alice",
    text: "请帮我总结一下今天的报警和影响范围",
    quoteText: "继续处理",
  });
});

test("buildFeishuReplyContext converts fetched parent text message", () => {
  const replyContext = buildFeishuReplyContext({
    messageId: "om_parent_123",
    actorName: "ou_reply_user",
    messageType: "text",
    content: JSON.stringify({
      text: "这条是被回复的飞书消息",
    }),
  });

  assert.deepEqual(replyContext, {
    messageId: "om_parent_123",
    actorName: "ou_reply_user",
    text: "这条是被回复的飞书消息",
  });
});

test("buildFeishuReplyContext falls back to attachment placeholder", () => {
  const replyContext = buildFeishuReplyContext({
    messageId: "om_parent_file",
    messageType: "file",
    content: JSON.stringify({
      file_key: "file_001",
      file_name: "设计说明.pdf",
    }),
  });

  assert.deepEqual(replyContext, {
    messageId: "om_parent_file",
    text: "[attachment] (document:设计说明.pdf)",
  });
});

test("buildReplyContextInstruction keeps reply block when body is empty", () => {
  const text = buildReplyContextInstruction({
    text: "",
    replyContext: {
      messageId: "321",
      actorName: "Alice",
      text: "原始被引用消息",
      quoteText: "被引用片段",
    },
  });

  assert.match(text, /<reply_context>/);
  assert.match(text, /reply_message_id: 321/);
  assert.match(text, /reply_actor_name: Alice/);
  assert.match(text, /reply_quote:\n被引用片段/);
  assert.match(text, /reply_message:\n原始被引用消息/);
});

test("buildReplyContextExtra exposes compact metadata", () => {
  assert.deepEqual(
    buildReplyContextExtra({
      messageId: "321",
      actorName: "Alice",
      text: "原始消息",
      quoteText: "片段",
    }),
    {
      hasReplyContext: true,
      replyMessageId: "321",
      replyActorName: "Alice",
      replyText: "原始消息",
      replyQuoteText: "片段",
    },
  );
});
