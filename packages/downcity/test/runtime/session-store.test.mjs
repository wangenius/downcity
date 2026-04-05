/**
 * Session 单实例测试（node:test）。
 *
 * 关键点（中文）
 * - Session 自己维护 executing 状态。
 * - Session 自己承接 run 与消息补写。
 * - 不再依赖全局 facade / registry 概念。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Session } from "../../bin/session/Session.js";

function createHistoryComposerStub() {
  const appended = [];
  return {
    sessionId: "chat-1",
    appended,
    async append(message) {
      appended.push(message);
    },
    userText(params) {
      return {
        role: "user",
        text: params.text,
        metadata: params.metadata,
      };
    },
    assistantText(params) {
      return {
        role: "assistant",
        text: params.text,
        metadata: params.metadata,
        kind: params.kind,
        source: params.source,
      };
    },
  };
}

test("Session tracks execution state and persists messages through the single instance", async () => {
  const afterUpdates = [];
  const historyComposer = createHistoryComposerStub();

  const session = new Session({
    sessionId: "chat-1",
    createHistoryComposer() {
      return historyComposer;
    },
    createExecutor() {
      return {
        async run() {
          return {
            success: true,
            assistantMessage: {
              role: "assistant",
              text: "done",
              metadata: {
                v: 1,
                ts: Date.now(),
                sessionId: "chat-1",
              },
            },
          };
        },
      };
    },
    runAfterSessionUpdated: async (sessionId) => {
      afterUpdates.push(sessionId);
    },
  });

  await session.appendUserMessage({
    text: "hello",
  });

  await session.appendAssistantMessage({
    fallbackText: "world",
  });

  const running = session.run({
    query: "run once",
  });

  assert.equal(session.isExecuting(), true);
  const result = await running;

  assert.equal(result.success, true);
  assert.equal(session.isExecuting(), false);
  assert.equal(historyComposer.appended.length, 2);
  assert.deepEqual(afterUpdates, ["chat-1", "chat-1"]);
});
