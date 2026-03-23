/**
 * Chat reply dispatch helper 测试（node:test）。
 *
 * 关键点（中文）
 * - beforeReply 应允许 plugin 改写最终回发文本。
 * - afterReply 应把发送结果作为 effect 事件抛给 plugin。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  emitChatReplyEffect,
  prepareChatReplyText,
} from "../../bin/services/chat/runtime/ReplyDispatch.js";

test("prepareChatReplyText returns pipeline-transformed text", async () => {
  const text = await prepareChatReplyText({
    runtime: {
      plugins: {
        async pipeline(pointName, value) {
          assert.equal(pointName, "chat.beforeReply");
          return {
            ...value,
            text: `[rewritten] ${value.text}`,
          };
        },
      },
    },
    input: {
      chatKey: "ctx-1",
      text: "hello",
      phase: "final",
      mode: "direct",
    },
  });

  assert.equal(text, "[rewritten] hello");
});

test("emitChatReplyEffect forwards dispatch result to plugin effect", async () => {
  let received = null;
  await emitChatReplyEffect({
    runtime: {
      plugins: {
        async effect(pointName, value) {
          assert.equal(pointName, "chat.afterReply");
          received = value;
        },
      },
    },
    input: {
      chatKey: "ctx-1",
      text: "hello",
      phase: "final",
      mode: "fallback",
      success: true,
    },
  });

  assert.deepEqual(received, {
    chatKey: "ctx-1",
    text: "hello",
    phase: "final",
    mode: "fallback",
    success: true,
  });
});
