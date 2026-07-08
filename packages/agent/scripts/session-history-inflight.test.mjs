/**
 * @file 验证 session records 会把运行中的 assistant 收敛到 inflight 快照，并在完成后写回正式历史。
 *
 * 关键点（中文）
 * - 直接覆盖 JSONL history store 的落盘语义，确保运行中不中断丢失过程。
 * - `messages.jsonl` 仍保持一轮一条 assistant 的正式历史语义。
 * - 运行中快照放在 `inflight.json`，浏览层读取时也应可见。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { JsonlSessionHistoryStore } from "../bin/index.js";

function create_assistant_message(parts) {
  return {
    id: "a:test:final",
    role: "assistant",
    metadata: {
      v: 1,
      ts: Date.now(),
      sessionId: "session_test",
      source: "egress",
      kind: "normal",
    },
    parts,
  };
}

test("JsonlSessionHistoryStore exposes inflight assistant during execution and finalizes it into history", async () => {
  const root_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-history-inflight-"),
  );

  const store = new JsonlSessionHistoryStore({
    rootPath: root_path,
    agentId: "official",
    sessionId: "session_test",
  });

  await store.write_record(
    store.userText({
      text: "write to document",
      metadata: {
        sessionId: "session_test",
      },
    }),
  );

  await store.write_inflight(
    create_assistant_message([
      { type: "step-start" },
      { type: "text", text: "Let me inspect the document.", state: "done" },
      {
        type: "tool-exec_command",
        toolCallId: "call_1",
        input: { cmd: "cat demo.mdx" },
        state: "output-available",
        output: { success: true, output: "# demo" },
      },
    ]),
  );

  const during_run = await store.list_records();
  assert.equal(during_run.length, 2);
  assert.equal(during_run[1]?.role, "assistant");
  assert.deepEqual(
    during_run[1]?.parts.map((part) => part.type),
    ["step-start", "text", "tool-exec_command"],
  );

  await store.finalize_inflight(
    create_assistant_message([
      { type: "text", text: "Done writing.", state: "done" },
    ]),
  );

  const after_finish = await store.list_records();
  assert.equal(after_finish.length, 2);
  assert.deepEqual(
    after_finish[1]?.parts.map((part) => part.type),
    ["step-start", "text", "tool-exec_command", "text"],
  );

  const inflight_path = path.join(
    root_path,
    ".downcity",
    "agents",
    "official",
    "sessions",
    "session_test",
    "messages",
    "inflight.json",
  );
  const inflight_exists = await fs
    .access(inflight_path)
    .then(() => true)
    .catch(() => false);
  assert.equal(inflight_exists, false);
});

test("Appending a new user message flushes stale inflight assistant before the new turn", async () => {
  const root_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-history-flush-"),
  );

  const store = new JsonlSessionHistoryStore({
    rootPath: root_path,
    agentId: "official",
    sessionId: "session_flush_test",
  });

  await store.write_record(
    store.userText({
      text: "first",
      metadata: {
        sessionId: "session_flush_test",
      },
    }),
  );

  await store.write_inflight(
    create_assistant_message([
      { type: "step-start" },
      { type: "text", text: "partial assistant", state: "done" },
    ]),
  );

  await store.write_record(
    store.userText({
      text: "second",
      metadata: {
        sessionId: "session_flush_test",
      },
    }),
  );

  const messages = await store.list_records();
  assert.equal(messages.length, 3);
  assert.equal(messages[0]?.role, "user");
  assert.equal(messages[1]?.role, "assistant");
  assert.equal(messages[2]?.role, "user");
});
