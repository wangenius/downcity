/**
 * SessionStore 公共入口测试（node:test）。
 *
 * 关键点（中文）
 * - 新的主名称应该是 `SessionStore`，而不是 `SessionRegistry`。
 * - 对外仍要保持现有运行、消息追加、执行状态追踪语义。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { SessionStore } from "../../bin/sessions/SessionStore.js";

function createPersistorStub() {
  const appended = [];
  return {
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

test("SessionStore tracks execution state and persists messages through the unified facade", async () => {
  const afterUpdates = [];
  const persistor = createPersistorStub();

  const runtimeRegistry = {
    getPersistor() {
      return persistor;
    },
    getRuntime() {
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
    clearRuntime() {},
  };

  const store = new SessionStore({
    runtimeRegistry,
    runAfterSessionUpdated: async (sessionId) => {
      afterUpdates.push(sessionId);
    },
  });

  await store.appendUserMessage({
    sessionId: "chat-1",
    text: "hello",
    requestId: "req-user",
  });

  await store.appendAssistantMessage({
    sessionId: "chat-1",
    fallbackText: "world",
    requestId: "req-assistant",
  });

  const running = store.run({
    sessionId: "chat-1",
    query: "run once",
  });

  assert.equal(store.isSessionExecuting("chat-1"), true);
  const result = await running;

  assert.equal(result.success, true);
  assert.equal(store.isSessionExecuting("chat-1"), false);
  assert.deepEqual(store.listExecutingSessionIds(), []);
  assert.equal(store.getExecutingSessionCount(), 0);
  assert.equal(persistor.appended.length, 2);
  assert.deepEqual(afterUpdates, ["chat-1", "chat-1"]);
});
