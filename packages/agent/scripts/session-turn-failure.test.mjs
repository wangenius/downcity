/**
 * @file 验证 Turn 失败收口与最终 Assistant 快照顺序。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { SessionApprovalBroker } from "../bin/session/approval/SessionApprovalBroker.js";
import { JsonlSessionMessageStore } from "../bin/session/messages/JsonlSessionMessageStore.js";
import { SessionMessages } from "../bin/session/SessionMessages.js";
import { SessionEventHub } from "../bin/session/runtime/SessionEventHub.js";
import { SessionTurn } from "../bin/session/SessionTurn.js";

async function create_turn_harness(execute_run) {
  const session_id = "session-turn-failure-test";
  const root_path = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-turn-failure-"));
  const messages = new SessionMessages({
    session_id,
    store: new JsonlSessionMessageStore({
      session_id,
      file_path: path.join(root_path, "active.jsonl"),
    }),
    publish: () => {},
  });
  await messages.initialize();

  const turn = new SessionTurn({
    session_id,
    project_root: root_path,
    executor: {
      run: async ({ runContext }) => await execute_run(runContext),
      stop: () => false,
      compact_history: async () => ({ compacted: false, reason: "nothing_to_compact" }),
    },
    state: {
      ensure_runnable: async () => {},
      ensure_title_from_history: async () => {},
      touch_metadata: async () => {},
    },
    messages,
    events: new SessionEventHub(),
    approvals: new SessionApprovalBroker({ session_id, messages }),
    apply_command: async () => {},
  });

  return { messages, turn };
}

test("Provider 在输出前失败时只持久化 Error Message", async () => {
  const { messages, turn } = await create_turn_harness(async () => ({
    success: false,
    error: "quota exceeded",
    deferredPersistedUserMessages: [],
  }));

  const handle = await turn.prompt({ query: "hello" });
  const result = await handle.finished;
  const page = await messages.list_messages();

  assert.equal(result.success, false);
  assert.equal(result.error, "quota exceeded");
  assert.equal(result.assistantMessage, undefined);
  assert.deepEqual(page.items.map((message) => message.type), ["user", "error"]);
  assert.equal(page.items[1].code, "turn_execution_failed");
  assert.equal(page.items[1].message, "quota exceeded");
});

test("Provider 在部分输出后失败时保留 failed Assistant 并追加 Error Message", async () => {
  const { messages, turn } = await create_turn_harness(async (run_context) => {
    await run_context.onUiMessageChunkCallback({ type: "text-start", id: "text-1" });
    await run_context.onUiMessageChunkCallback({
      type: "text-delta",
      id: "text-1",
      delta: "partial response",
    });
    await run_context.onUiMessageChunkCallback({ type: "text-end", id: "text-1" });
    return {
      success: false,
      error: "stream interrupted",
      deferredPersistedUserMessages: [],
    };
  });

  const handle = await turn.prompt({ query: "hello" });
  const result = await handle.finished;
  const page = await messages.list_messages();

  assert.equal(result.success, false);
  assert.equal(result.assistantMessage, undefined);
  assert.deepEqual(page.items.map((message) => message.type), [
    "user",
    "assistant",
    "error",
  ]);
  assert.equal(page.items[1].status, "failed");
  assert.equal(page.items[1].parts[0].text, "partial response");
  assert.equal(page.items[2].message, "stream interrupted");
});

test("Turn 最终快照按真实顺序补齐流式阶段缺失的 Tool", async () => {
  const { messages, turn } = await create_turn_harness(async (run_context) => {
    await run_context.onUiMessageChunkCallback({ type: "text-start", id: "text-1" });
    await run_context.onUiMessageChunkCallback({
      type: "text-delta",
      id: "text-1",
      delta: "最终结论",
    });
    await run_context.onUiMessageChunkCallback({ type: "text-end", id: "text-1" });
    return {
      success: true,
      assistantMessage: {
        id: "assistant-1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "call-1",
            toolName: "shell_exec",
            state: "output-available",
            input: { cmd: "pwd" },
            output: { success: true },
          },
          { type: "text", text: "最终结论", state: "done" },
        ],
      },
      deferredPersistedUserMessages: [],
    };
  });

  const handle = await turn.prompt({ query: "diagnose" });
  const result = await handle.finished;
  const page = await messages.list_messages();
  const assistant = page.items.find((message) => message.type === "assistant");

  assert.equal(result.success, true);
  assert.deepEqual(assistant.parts.map((part) => part.type), ["tool", "text"]);
  assert.deepEqual(assistant.parts.map((part) => part.sequence), [1, 2]);
});
