/**
 * @file 验证 SessionHistoryWriter 不会掩盖事实源写入失败。
 *
 * 关键点（中文）
 * - user 消息写入失败必须向调用方抛出。
 * - assistant inflight 落盘失败也必须向调用方抛出。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SessionHistoryWriter } from "../bin/executor/composer/history/SessionHistoryWriter.js";

function create_failing_history_store() {
  return {
    userText() {
      throw new Error("unused");
    },
    assistantText() {
      throw new Error("unused");
    },
    async write_record() {
      throw new Error("disk full");
    },
    async finalize_inflight() {
      throw new Error("disk full");
    },
  };
}

test("append_user_message propagates history write failures", async () => {
  const writer = new SessionHistoryWriter({
    sessionId: "writer_error_session",
    getHistoryStore: create_failing_history_store,
  });

  await assert.rejects(
    writer.append_user_message({
      message: { v: 1, id: "user_1", role: "user", parts: [] },
    }),
    /disk full/,
  );
});

test("append_assistant_message propagates history write failures", async () => {
  const writer = new SessionHistoryWriter({
    sessionId: "writer_error_session",
    getHistoryStore: create_failing_history_store,
  });

  await assert.rejects(
    writer.append_assistant_message({
      message: { v: 1, id: "assistant_1", role: "assistant", parts: [] },
    }),
    /disk full/,
  );
});
