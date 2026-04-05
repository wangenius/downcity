/**
 * Session 执行器重建测试（node:test）。
 *
 * 关键点（中文）
 * - Session 持有固定的 history Composer 实例。
 * - clearExecutor 只清 executor，不清 history Composer。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Session } from "../../bin/session/Session.js";

test("Session recreates executor without recreating history composer after clearExecutor", () => {
  const createdExecutors = [];
  const historyComposer = {
    sessionId: "chat-a",
    tag: "history-composer:1",
  };

  const session = new Session({
    sessionId: "chat-a",
    historyComposer,
    createExecutor(historyComposer) {
      const runtime = {
        historyComposer,
        tag: `runtime:${createdExecutors.length + 1}`,
      };
      createdExecutors.push(runtime);
      return runtime;
    },
  });

  const firstHistoryComposer = session.getHistoryComposer();
  const firstRuntime = session.getExecutor();

  session.clearExecutor();

  const secondHistoryComposer = session.getHistoryComposer();
  const secondRuntime = session.getExecutor();

  assert.equal(firstHistoryComposer, secondHistoryComposer);
  assert.notEqual(firstRuntime, secondRuntime);
  assert.equal(secondRuntime.historyComposer, firstHistoryComposer);
  assert.equal(createdExecutors.length, 2);
});
