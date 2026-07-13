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
import { SessionViewService } from "../bin/session/services/SessionViewService.js";
import { MockLanguageModelV3 } from "ai/test";

async function create_recorder(session_id = "session-recorder-test") {
  const root_path = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-session-recorder-"));
  const file_path = path.join(root_path, "active.jsonl");
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

async function create_seeded_recorder(session_id, messages) {
  const root_path = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-session-seeded-"));
  const file_path = path.join(root_path, "active.jsonl");
  await fs.writeFile(
    file_path,
    `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
    "utf8",
  );
  const recorder = new SessionRecorder({
    session_id,
    store: new JsonlSessionMessageStore({ session_id, file_path }),
    publish: () => {},
  });
  await recorder.initialize();
  return { recorder, file_path };
}

function create_seeded_user_message(session_id, sequence) {
  return {
    message_id: `user-${String(sequence)}`,
    session_id,
    turn_id: `turn-${String(sequence)}`,
    sequence,
    revision: 1,
    visibility: "visible",
    created_at: sequence,
    updated_at: sequence,
    type: "user",
    input_type: "prompt",
    parts: [{
      part_id: `user-text-${String(sequence)}`,
      type: "text",
      text: `message ${String(sequence)}`,
      state: "done",
    }],
  };
}

test("delta 只更新 Assistant 草稿，完成后才写入 active.jsonl", async () => {
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

  const page = await recovered.list_messages();
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

test("compact 把 Active 前缀关闭为带累计 Summary 的 Segment", async () => {
  const { recorder, file_path } = await create_recorder("compact-test");
  for (let index = 1; index <= 6; index += 1) {
    await recorder.append_user_message({
      turn_id: `turn-${String(index)}`,
      input_type: "prompt",
      parts: [{ part_id: `user-${String(index)}`, type: "text", text: `message ${String(index)}`, state: "done" }],
    });
  }
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
    force: true,
  });
  assert.equal(result.compacted, true);
  assert.equal((await fs.readFile(file_path, "utf8")).includes("message 1"), false);
  const active = await recorder.list_messages({ include_internal: true });
  assert.deepEqual(active.items.map((message) => message.sequence), []);
  assert.equal(active.source, "active");
  assert.equal(active.has_more, true);
  const segment = await recorder.list_messages({
    before_sequence: 7,
    include_internal: true,
  });
  assert.deepEqual(segment.items.map((message) => message.sequence), [1, 2, 3, 4, 5, 6]);
  assert.equal(segment.source, "segment");
  assert.equal((await history_store.list_records()).length, 1);
  await assert.rejects(
    recorder.list_messages({ before_sequence: 0 }),
    /before_sequence must be a positive integer/,
  );
});

test("重启后从最新 Segment Summary 与 Active 恢复模型上下文", async () => {
  const session_id = "compact-restart-test";
  const { recorder, file_path } = await create_recorder(session_id);
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
  await recorder.compact_active({
    through_sequence: 4,
    summary: {
      record_type: "summary",
      session_id,
      summary_id: "summary-through-4",
      through_sequence: 4,
      text: "summary through 4",
      created_at: 7,
    },
  });

  const restarted = new SessionRecorder({
    session_id,
    store: new JsonlSessionMessageStore({ session_id, file_path }),
    publish: () => {},
  });
  await restarted.initialize();
  const context_store = new SessionRecorderHistoryStore({ session_id, recorder: restarted });
  const context = await context_store.list_records();
  assert.deepEqual(
    context.map((message) => message.parts[0]?.text),
    ["summary through 4", "message 5", "message 6"],
  );
  const segment = await restarted.list_messages({ before_sequence: 5 });
  assert.deepEqual(segment.items.map((message) => message.sequence), [1, 2, 3, 4]);
});

test("Compact 两步提交中断后会清理 Active 与 Segment 的重叠前缀", async () => {
  const session_id = "compact-overlap-recovery-test";
  const { recorder, file_path } = await create_recorder(session_id);
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
  await recorder.compact_active({
    through_sequence: 4,
    summary: {
      record_type: "summary",
      session_id,
      summary_id: "summary-through-4",
      through_sequence: 4,
      text: "summary through 4",
      created_at: 7,
    },
  });

  const segment_path = path.join(
    path.dirname(file_path),
    "segments",
    "000000000001-000000000004.jsonl",
  );
  const segment_rows = await read_jsonl(segment_path);
  const active_rows = await read_jsonl(file_path);
  await fs.writeFile(
    file_path,
    `${[...segment_rows.slice(0, -1), ...active_rows]
      .map((message) => JSON.stringify(message))
      .join("\n")}\n`,
    "utf8",
  );

  const restarted = new SessionRecorder({
    session_id,
    store: new JsonlSessionMessageStore({ session_id, file_path }),
    publish: () => {},
  });
  await restarted.initialize();
  const active = await restarted.list_messages();
  assert.deepEqual(active.items.map((message) => message.sequence), [5, 6]);
  assert.deepEqual(
    (await read_jsonl(file_path)).map((message) => message.sequence),
    [5, 6],
  );
});

test("连续 Compact 生成按 sequence 连续的 Segment 与累计 Summary", async () => {
  const session_id = "cumulative-compact-test";
  const { recorder } = await create_recorder(session_id);
  const prompts = [];
  let generation_count = 0;
  const model = new MockLanguageModelV3({
    modelId: "cumulative-compact-model",
    doGenerate: async (options) => {
      prompts.push(JSON.stringify(options.prompt));
      generation_count += 1;
      return {
        content: [{ type: "text", text: `Summary ${String(generation_count)}` }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 0, text: 0, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  const history_store = new SessionRecorderHistoryStore({ session_id, recorder });
  const append_messages = async (start, end) => {
    for (let index = start; index <= end; index += 1) {
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
  };
  const compact = async () => await history_store.compact({
    model,
    system: [],
    force: true,
  });

  await append_messages(1, 8);
  assert.equal((await compact()).compacted, true);
  await append_messages(9, 12);
  assert.equal((await compact()).compacted, true);

  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].includes("<previous-summary>"), true);
  assert.equal(prompts[1].includes("Summary 1"), true);
  const active = await recorder.list_messages();
  assert.deepEqual(active.items.map((message) => message.sequence), []);
  const latest_segment = await recorder.list_messages({ before_sequence: 13 });
  assert.deepEqual(latest_segment.items.map((message) => message.sequence), [9, 10, 11, 12]);
  assert.equal(latest_segment.has_more, true);
  const earliest_segment = await recorder.list_messages({
    before_sequence: latest_segment.start_sequence,
  });
  assert.deepEqual(earliest_segment.items.map((message) => message.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  const context = await history_store.list_records();
  assert.equal(context[0].parts[0]?.text, "Summary 2");
});

test("Summary 生成失败时使用确定性 Summary 完成归档", async () => {
  const session_id = "compact-summary-failure-test";
  const { recorder, file_path } = await create_recorder(session_id);
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
  const model = new MockLanguageModelV3({
    modelId: "failed-compact-model",
    doGenerate: async () => {
      throw new Error("summary unavailable");
    },
  });
  const history_store = new SessionRecorderHistoryStore({ session_id, recorder });
  const result = await history_store.compact({
    model,
    system: [],
    force: true,
  });

  assert.deepEqual(result, { compacted: true });
  assert.deepEqual((await recorder.list_messages()).items, []);
  const segment_entries = await fs.readdir(path.join(path.dirname(file_path), "segments"));
  assert.equal(segment_entries.length, 1);
});

test("内部上下文读取完整快照并保留第 500 条之后的最新消息", async () => {
  const session_id = "complete-context-snapshot-test";
  const messages = Array.from(
    { length: 501 },
    (_, index) => create_seeded_user_message(session_id, index + 1),
  );
  const { recorder } = await create_seeded_recorder(session_id, messages);
  await recorder.compact_active({
    through_sequence: 499,
    summary: {
      record_type: "summary",
      session_id,
      summary_id: "summary-through-499",
      through_sequence: 499,
      text: "summary through 499",
      created_at: 502,
    },
  });

  const active = await recorder.list_messages();
  assert.deepEqual(active.items.map((message) => message.sequence), [500, 501]);
  assert.equal(active.source, "active");
  assert.equal(active.next_before_sequence, 500);
  const previous = await recorder.list_messages({ before_sequence: 500 });
  assert.equal(previous.source, "segment");
  assert.equal(previous.items.length, 499);
  assert.equal(previous.start_sequence, 1);
  assert.equal(previous.end_sequence, 499);

  const history_store = new SessionRecorderHistoryStore({ session_id, recorder });
  const context = await history_store.list_records();
  assert.deepEqual(
    context.map((message) => message.parts[0]?.text),
    ["summary through 499", "message 500", "message 501"],
  );
});

test("Session fork 可以选择并复制第 500 条之后的消息", async () => {
  const session_id = "complete-fork-snapshot-test";
  const messages = Array.from(
    { length: 501 },
    (_, index) => create_seeded_user_message(session_id, index + 1),
  );
  const { recorder } = await create_seeded_recorder(session_id, messages);
  let imported_messages = [];
  const state_service = {
    emit_action_event: async () => {},
    get_config: () => ({}),
  };
  const view_service = new SessionViewService({
    agent_id: "fork-agent",
    project_root: os.tmpdir(),
    session_id,
    history_store: new SessionRecorderHistoryStore({ session_id, recorder }),
    recorder,
    state_service,
    logger: { log: async () => {} },
    is_executing: () => false,
    get_instruction_system_blocks: () => [],
    get_managed_plugin_system_blocks: async () => [],
    get_plugin_system_blocks: async () => [],
    create_fork_session: async () => ({
      session: { id: "forked-session", set: async () => {} },
      history_store: {},
      recorder: {
        import_messages: async (input) => {
          imported_messages = input;
        },
      },
      state_service: { set: async () => {} },
    }),
  });

  await view_service.fork("user-501");

  assert.equal(imported_messages.length, 501);
  assert.equal(imported_messages[500].message_id, "user-501");
});
