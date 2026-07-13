/**
 * @file 验证 SessionRecorder 的 Message 快照、Assistant 草稿与实时事件一致性。
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
  const root_path = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-session-recorder-"));
  const file_path = path.join(root_path, "messages.jsonl");
  const assistant_message_file_path = path.join(root_path, "assistant_message.json");
  const events = [];
  const recorder = new SessionRecorder({
    session_id,
    store: new JsonlSessionMessageStore({ session_id, file_path }),
    publish: (mutation) => events.push(mutation),
  });
  await recorder.initialize();
  return { recorder, events, file_path, assistant_message_file_path };
}

async function read_jsonl(file_path) {
  const raw = await fs.readFile(file_path, "utf8");
  return raw.split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("delta 只更新 Assistant 草稿，完成后才写入 messages.jsonl", async () => {
  const { recorder, events, file_path, assistant_message_file_path } = await create_recorder();
  await recorder.append_user_message({
    turn_id: "turn-1",
    input_type: "prompt",
    parts: [{ part_id: "user-text-1", type: "text", text: "你好", state: "done" }],
  });
  const writer = await recorder.open_assistant_message({ turn_id: "turn-1", segment_index: 1 });
  await writer.apply_chunk({ type: "text-start", id: "text-1" });
  await writer.apply_chunk({ type: "text-delta", id: "text-1", delta: "你" });
  await writer.apply_chunk({ type: "text-delta", id: "text-1", delta: "好" });

  const history_during_stream = await read_jsonl(file_path);
  const draft = JSON.parse(await fs.readFile(assistant_message_file_path, "utf8"));
  assert.equal(history_during_stream.length, 1);
  assert.equal(history_during_stream[0].type, "user");
  assert.equal(draft.type, "assistant");
  assert.equal(draft.parts[0].text, "你好");
  assert.equal(draft.parts[0].sequence, 1);

  await writer.apply_chunk({ type: "text-end", id: "text-1" });
  await writer.complete();

  const history = await read_jsonl(file_path);
  assert.deepEqual(history.map((message) => message.type), ["user", "assistant"]);
  assert.equal(history[1].parts[0].text, "你好");
  assert.equal(await fs.stat(assistant_message_file_path).then(() => true).catch(() => false), false);
  assert.deepEqual(events.map((event) => `${event.variant}:${event.type}`), [
    "message:user",
    "message:assistant",
    "part:text",
    "delta:text",
    "delta:text",
    "part:text",
    "message:assistant",
  ]);
  assert.equal(history.some((value) => "variant" in value), false);
});

test("Tool Part 在文本中间创建后，输入、审批和输出都保持原顺序", async () => {
  const { recorder, events, file_path } = await create_recorder("tool-order-test");
  const writer = await recorder.open_assistant_message({ turn_id: "turn-1", segment_index: 1 });
  await writer.apply_chunk({ type: "text-start", id: "text-1" });
  await writer.apply_chunk({ type: "text-delta", id: "text-1", delta: "before" });
  await writer.apply_chunk({ type: "text-end", id: "text-1" });
  await writer.apply_chunk({ type: "tool-input-start", toolCallId: "call-1", toolName: "search" });
  await writer.apply_chunk({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "search",
    input: { query: "downcity" },
  });
  assert.equal(recorder.get_message(writer.message_id).parts[1].state, "ready");
  await writer.apply_chunk({
    type: "tool-approval-request",
    toolCallId: "call-1",
    approvalId: "approval-1",
  });
  assert.equal(recorder.get_message(writer.message_id).parts[1].state, "approval-required");
  await writer.apply_chunk({ type: "text-start", id: "text-2" });
  await writer.apply_chunk({ type: "text-delta", id: "text-2", delta: "after" });
  await writer.apply_chunk({ type: "text-end", id: "text-2" });
  await writer.apply_chunk({ type: "tool-output-available", toolCallId: "call-1", output: { count: 1 } });
  await writer.complete();

  const assistant = (await read_jsonl(file_path))[0];
  assert.deepEqual(assistant.parts.map((part) => part.type), ["text", "tool", "text"]);
  assert.deepEqual(assistant.parts.map((part) => part.sequence), [1, 2, 3]);
  assert.equal(assistant.parts[1].state, "completed");
  assert.deepEqual(assistant.parts[1].output, { count: 1 });
  assert.deepEqual(
    events
      .filter((event) => event.variant === "part" && event.type === "tool")
      .map((event) => [event.part.sequence, event.part.state]),
    [[2, "input-streaming"], [2, "ready"], [2, "approval-required"], [2, "completed"]],
  );
});

test("不同模型 step 重复使用 Text chunk ID 时仍保持真实 Part 顺序", async () => {
  const { recorder, file_path } = await create_recorder("reused-text-id-order-test");
  const writer = await recorder.open_assistant_message({ turn_id: "turn-1", segment_index: 1 });

  await writer.apply_chunk({ type: "text-start", id: "txt-0" });
  await writer.apply_chunk({ type: "text-delta", id: "txt-0", delta: "first" });
  await writer.apply_chunk({ type: "text-end", id: "txt-0" });
  await writer.apply_chunk({ type: "tool-input-start", toolCallId: "call-1", toolName: "search" });
  await writer.apply_chunk({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "search",
    input: { query: "first" },
  });
  await writer.apply_chunk({ type: "tool-output-available", toolCallId: "call-1", output: "one" });

  await writer.apply_chunk({ type: "text-start", id: "txt-0" });
  await writer.apply_chunk({ type: "text-delta", id: "txt-0", delta: "second" });
  await writer.apply_chunk({ type: "text-end", id: "txt-0" });
  await writer.apply_chunk({ type: "tool-input-start", toolCallId: "call-2", toolName: "search" });
  await writer.apply_chunk({
    type: "tool-input-available",
    toolCallId: "call-2",
    toolName: "search",
    input: { query: "second" },
  });
  await writer.apply_chunk({ type: "tool-output-available", toolCallId: "call-2", output: "two" });
  await writer.complete();

  const assistant = (await read_jsonl(file_path))[0];
  assert.deepEqual(assistant.parts.map((part) => part.type), ["text", "tool", "text", "tool"]);
  assert.deepEqual(assistant.parts.map((part) => part.sequence), [1, 2, 3, 4]);
  assert.deepEqual(
    assistant.parts.filter((part) => part.type === "text").map((part) => part.text),
    ["first", "second"],
  );
  assert.notEqual(assistant.parts[0].part_id, assistant.parts[2].part_id);
});

test("空 Text Start 不会抢占后续 Tool 的真实顺序", async () => {
  const { recorder, events, file_path } = await create_recorder("deferred-text-order-test");
  const writer = await recorder.open_assistant_message({ turn_id: "turn-1", segment_index: 1 });

  await writer.apply_chunk({ type: "reasoning-start", id: "reasoning-0" });
  await writer.apply_chunk({ type: "reasoning-delta", id: "reasoning-0", delta: "先执行命令" });
  await writer.apply_chunk({ type: "reasoning-end", id: "reasoning-0" });
  await writer.apply_chunk({ type: "text-start", id: "text-0" });
  await writer.apply_chunk({
    type: "tool-input-start",
    toolCallId: "call-1",
    toolName: "shell_exec",
  });
  await writer.apply_chunk({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "shell_exec",
    input: { cmd: "pwd" },
  });
  await writer.apply_chunk({
    type: "tool-output-available",
    toolCallId: "call-1",
    output: { success: true },
  });
  await writer.apply_chunk({ type: "text-delta", id: "text-0", delta: "命令执行完成" });
  await writer.apply_chunk({ type: "text-end", id: "text-0" });
  await writer.complete();

  const assistant = (await read_jsonl(file_path))[0];
  assert.deepEqual(assistant.parts.map((part) => part.type), ["reasoning", "tool", "text"]);
  assert.deepEqual(assistant.parts.map((part) => part.sequence), [1, 2, 3]);
  assert.deepEqual(
    events
      .filter((event) => event.variant === "part")
      .map((event) => [event.type, event.part.sequence]),
    [
      ["reasoning", 1],
      ["reasoning", 1],
      ["tool", 2],
      ["tool", 2],
      ["tool", 2],
      ["text", 3],
      ["text", 3],
    ],
  );
});

test("重启时将 Assistant 草稿收口为 stopped，并将运行中 Action 标记失败", async () => {
  const { recorder, file_path, assistant_message_file_path } = await create_recorder("recovery-test");
  await recorder.append_user_message({
    turn_id: "turn-1",
    input_type: "prompt",
    parts: [{ part_id: "u1", type: "text", text: "one", state: "done" }],
  });
  const writer = await recorder.open_assistant_message({ turn_id: "turn-1", segment_index: 1 });
  await writer.apply_chunk({ type: "text-start", id: "text-1" });
  await writer.apply_chunk({ type: "text-delta", id: "text-1", delta: "partial" });
  await recorder.open_action_message({ message_id: "running-action", action_type: "fork", title: "Forking" });

  const recovered_events = [];
  const recovered = new SessionRecorder({
    session_id: "recovery-test",
    store: new JsonlSessionMessageStore({ session_id: "recovery-test", file_path }),
    publish: (mutation) => recovered_events.push(mutation),
  });
  await recovered.initialize();

  const page = await recovered.list_messages({ limit: 10 });
  assert.deepEqual(page.items.map((message) => message.type), ["user", "assistant", "action"]);
  assert.equal(page.items[1].status, "stopped");
  assert.equal(page.items[1].parts[0].text, "partial");
  assert.equal(page.items[2].status, "failed");
  assert.deepEqual(recovered_events.map((event) => `${event.variant}:${event.type}`), [
    "message:assistant",
    "message:action",
  ]);
  assert.equal(await fs.stat(assistant_message_file_path).then(() => true).catch(() => false), false);
});

test("Action revision 追加完整快照，读取时只返回最新版本", async () => {
  const { recorder, file_path } = await create_recorder("action-revision-test");
  const action = await recorder.open_action_message({
    message_id: "action-1",
    action_type: "compact",
    title: "Compacting",
  });
  await action.complete({ title: "Compacted" });
  const history = await read_jsonl(file_path);
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((message) => message.revision), [1, 2]);
  const page = await recorder.list_messages();
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].title, "Compacted");
});

test("compact 追加 internal summary 且不重写已有 Message 快照", async () => {
  const { recorder, file_path } = await create_recorder("compact-test");
  for (let index = 1; index <= 6; index += 1) {
    await recorder.append_user_message({
      turn_id: `turn-${String(index)}`,
      input_type: "prompt",
      parts: [{ part_id: `user-${String(index)}`, type: "text", text: `message ${String(index)}`, state: "done" }],
    });
  }
  const before = await fs.readFile(file_path, "utf8");
  const history_store = new SessionRecorderHistoryStore({ session_id: "compact-test", recorder });
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
  assert.equal((await fs.readFile(file_path, "utf8")).startsWith(before), true);
  const all = await recorder.list_messages({ limit: 100, include_internal: true });
  const summary = all.items.find((message) => message.type === "assistant" && message.kind === "summary");
  assert.equal(summary.visibility, "internal");
  assert.equal(summary.parts[0].sequence, 1);
  assert.equal((await history_store.list_records()).length, 4);
});
