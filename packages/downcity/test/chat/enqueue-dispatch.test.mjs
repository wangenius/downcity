/**
 * Chat enqueue dispatch helper 测试（node:test）。
 *
 * 关键点（中文）
 * - beforeEnqueue 应允许 plugin 改写入队文本。
 * - afterEnqueue 应把入队结果作为 effect 事件抛给 plugin。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  emitChatEnqueueEffect,
  prepareChatEnqueue,
} from "../../bin/services/chat@/city/runtime/console/EnqueueDispatch.js";

test("prepareChatEnqueue returns pipeline-transformed payload", async () => {
  const next = await prepareChatEnqueue({
    context: {
      plugins: {
        async pipeline(pointName, value) {
          assert.equal(pointName, "chat.beforeEnqueue");
          return {
            ...value,
            text: `[queued] ${value.text}`,
            extra: {
              ...(value.extra || {}),
              tagged: true,
            },
          };
        },
      },
    },
    input: {
      kind: "exec",
      channel: "telegram",
      chatKey: "ctx-1",
      chatId: "chat-1",
      text: "hello",
      extra: {
        source: "test",
      },
    },
  });

  assert.equal(next.text, "[queued] hello");
  assert.deepEqual(next.extra, {
    source: "test",
    tagged: true,
  });
});

test("emitChatEnqueueEffect forwards enqueue result to plugin effect", async () => {
  let received = null;
  await emitChatEnqueueEffect({
    context: {
      plugins: {
        async effect(pointName, value) {
          assert.equal(pointName, "chat.afterEnqueue");
          received = value;
        },
      },
    },
    input: {
      kind: "audit",
      channel: "qq",
      chatKey: "ctx-1",
      chatId: "chat-1",
      text: "hello",
      itemId: "q:1",
      lanePosition: 2,
    },
  });

  assert.deepEqual(received, {
    kind: "audit",
    channel: "qq",
    chatKey: "ctx-1",
    chatId: "chat-1",
    text: "hello",
    itemId: "q:1",
    lanePosition: 2,
  });
});
