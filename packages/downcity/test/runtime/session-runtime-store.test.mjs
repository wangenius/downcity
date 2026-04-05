/**
 * Session 懒加载缓存测试（node:test）。
 *
 * 关键点（中文）
 * - history Composer 在单个 Session 实例内只创建一次。
 * - clearExecutor 只清 executor，不清 history Composer。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Session } from "../../bin/session/Session.js";

test("Session recreates executor without recreating history composer after clearExecutor", () => {
  const createdHistoryComposers = [];
  const createdExecutors = [];

  const session = new Session({
    sessionId: "chat-a",
    createHistoryComposer() {
      const historyComposer = {
        sessionId: "chat-a",
        tag: `history-composer:${createdHistoryComposers.length + 1}`,
      };
      createdHistoryComposers.push(historyComposer);
      return historyComposer;
    },
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
  assert.equal(createdHistoryComposers.length, 1);
  assert.equal(createdExecutors.length, 2);
});
