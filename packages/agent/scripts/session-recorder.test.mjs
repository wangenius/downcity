/**
 * @file 验证 SessionRecorder 单一 Mutation 日志与实时/历史一致性。
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { JsonlSessionMessageStore } from "../bin/session/recorder/JsonlSessionMessageStore.js";
import { SessionRecorder } from "../bin/session/recorder/SessionRecorder.js";
import { SessionRecorderHistoryStore } from "../bin/session/recorder/SessionRecorderHistoryStore.js";
import { MockLanguageModelV3 } from "ai/test";

async function create_recorder(session_id = "session-recorder-test") {
  const root_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-session-recorder-"),
  );
  const file_path = path.join(root_path, "messages.jsonl");
  const events = [];
  const recorder = new SessionRecorder({
    session_id,
    store: new JsonlSessionMessageStore({ session_id, file_path }),
    publish: (mutation) => events.push(mutation),
  });
  await recorder.initialize();
  return { recorder, events, file_path };
}

test("每个 assistant delta 都先持久化为独立 Mutation 再发布", async () => {
  const { recorder, events, file_path } = await create_recorder();
  await recorder.append_user_message({
    turn_id: "turn-1",
    input_type: "prompt",
    parts: [{
      part_id: "user-text-1",
      type: "text",
      text: "你好",
      state: "done",
    }],
  });
  const writer = await recorder.open_assistant_message({
    turn_id: "turn-1",
    segment_index: 1,
  });
  await writer.apply_chunk({ type: "text-start", id: "text-1" });
  await writer.apply_chunk({ type: "text-delta", id: "text-1", delta: "你" });
  await writer.apply_chunk({ type: "text-delta", id: "text-1", delta: "好" });
  await writer.apply_chunk({ type: "text-end", id: "text-1" });
  await writer.complete();

  const changes = await recorder.list_message_changes({
    after_commit_sequence: 0,
  });
  const persisted_lines = (await fs.readFile(file_path, "utf8"))
    .trim()
    .split("\n");
  assert.equal(persisted_lines.length, changes.items.length);
  assert.deepEqual(
    changes.items.map((item) => item.commit_sequence),
    events.map((item) => item.commit_sequence),
  );
  assert.deepEqual(
    changes.items.map((item) => `${item.variant}:${item.type}`),
    [
      "message:user",
      "message:assistant",
      "part:text",
      "delta:text",
      "delta:text",
      "part:text",
      "message:assistant",
    ],
  );
  assert.deepEqual(
    changes.items
      .filter((item) => item.variant === "delta")
      .map((item) => item.delta),
    ["你", "好"],
  );

  const page = await recorder.list_messages();
  assert.deepEqual(page.items.map((item) => item.type), ["user", "assistant"]);
  const assistant = page.items[1];
  assert.equal(assistant.status, "completed");
  assert.equal(assistant.parts[0].text, "你好");
});

test("tool 与 action 在原 Message 和 part 上更新", async () => {
  const { recorder } = await create_recorder("tool-action-test");
  const writer = await recorder.open_assistant_message({
    turn_id: "turn-1",
    segment_index: 1,
  });
  await writer.apply_chunk({
    type: "tool-input-start",
    toolCallId: "call-1",
    toolName: "search",
  });
  await writer.apply_chunk({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "search",
    input: { query: "downcity" },
  });
  await writer.apply_chunk({
    type: "tool-output-available",
    toolCallId: "call-1",
    output: { count: 1 },
  });
  await writer.complete();

  const action = await recorder.open_action_message({
    message_id: "action-1",
    action_type: "compact",
    title: "Compacting",
  });
  const running = recorder.get_message("action-1");
  await action.complete({ title: "Compacted" });
  const completed = recorder.get_message("action-1");

  const assistant = (await recorder.list_messages()).items[0];
  assert.equal(assistant.parts.length, 1);
  assert.equal(assistant.parts[0].state, "completed");
  assert.deepEqual(assistant.parts[0].output, { count: 1 });
  assert.equal(running.sequence, completed.sequence);
  assert.equal(completed.revision, running.revision + 1);
  assert.equal(completed.status, "completed");
});

test("snapshot、changes 分页和重启恢复保持单调顺序", async () => {
  const { recorder, file_path } = await create_recorder("recovery-test");
  await recorder.append_user_message({
    turn_id: "turn-1",
    input_type: "prompt",
    parts: [{ part_id: "u1", type: "text", text: "one", state: "done" }],
  });
  await recorder.open_assistant_message({
    turn_id: "turn-1",
    segment_index: 1,
  });
  await recorder.open_action_message({
    message_id: "running-action",
    action_type: "fork",
    title: "Forking",
  });

  const recovered_events = [];
  const recovered = new SessionRecorder({
    session_id: "recovery-test",
    store: new JsonlSessionMessageStore({
      session_id: "recovery-test",
      file_path,
    }),
    publish: (mutation) => recovered_events.push(mutation),
  });
  await recovered.initialize();

  const first_page = await recovered.list_messages({ limit: 2 });
  const second_page = await recovered.list_messages({
    limit: 2,
    cursor: first_page.next_cursor,
  });
  assert.equal(first_page.items.length, 2);
  assert.equal(second_page.items.length, 1);
  assert.ok(first_page.items[1].sequence < second_page.items[0].sequence);

  const messages = [...first_page.items, ...second_page.items];
  assert.equal(messages[1].status, "stopped");
  assert.equal(messages[2].status, "failed");
  assert.deepEqual(
    recovered_events.map((item) => `${item.variant}:${item.type}`),
    ["message:assistant", "message:action"],
  );

  const first_changes = await recovered.list_message_changes({
    after_commit_sequence: 0,
    limit: 2,
  });
  const next_changes = await recovered.list_message_changes({
    after_commit_sequence: first_changes.next_commit_sequence,
    limit: 100,
  });
  assert.equal(first_changes.has_more, true);
  assert.ok(
    first_changes.items.at(-1).commit_sequence <
      next_changes.items[0].commit_sequence,
  );
});

test("compact 追加 internal summary 且不重写 Mutation 日志", async () => {
  const { recorder, file_path } = await create_recorder("compact-test");
  for (let index = 1; index <= 6; index += 1) {
    await recorder.append_user_message({
      turn_id: `turn-${String(index)}`,
      input_type: "prompt",
      parts: [{
        part_id: `user-${String(index)}`,
        type: "text",
        text: `message ${String(index)}`,
        state: "done",
      }],
    });
  }
  const before = await fs.readFile(file_path, "utf8");
  const history_store = new SessionRecorderHistoryStore({
    session_id: "compact-test",
    recorder,
  });
  const model = new MockLanguageModelV3({
    modelId: "compact-model",
    doGenerate: async () => ({
      content: [{ type: "text", text: "Compact summary" }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 0, text: 0, reasoning: 0 },
      },
      warnings: [],
    }),
  });
  const result = await history_store.compact({
    model,
    system: [],
    keepLastMessages: 2,
    maxInputTokensApprox: 1,
    archiveOnCompact: false,
    compactRatio: 0.5,
  });
  assert.equal(result.compacted, true);

  const after = await fs.readFile(file_path, "utf8");
  assert.equal(after.startsWith(before), true);
  const all = await recorder.list_messages({
    limit: 100,
    include_internal: true,
  });
  const summary = all.items.find(
    (message) => message.type === "assistant" && message.kind === "summary",
  );
  assert.equal(summary.visibility, "internal");
  assert.equal(summary.summary_through_message_id, all.items[2].message_id);
  assert.equal((await history_store.list_records()).length, 4);
});
