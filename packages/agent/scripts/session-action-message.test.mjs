/**
 * @file 验证 action record 的持久化、模型输入过滤与 timeline 投影。
 *
 * 关键点（中文）
 * - action record 会作为 `type=action` item 写入 JSONL。
 * - 同一个 action id 会被更新为一条历史记录，不拆成 running/completed 多条。
 * - history composer 组装 LLM 输入时必须过滤 action record。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { JsonlSessionHistoryStore } from "../bin/executor/store/history/jsonl/JsonlSessionHistoryStore.js";
import { JsonlSessionHistoryComposer } from "../bin/executor/composer/history/jsonl/JsonlSessionHistoryComposer.js";
import { toSessionTimelineEvents } from "../bin/session/browse/Browse.js";
import { Agent } from "../bin/index.js";

test("action record is upserted but filtered from LLM history", async () => {
  const root_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-action-message-"),
  );
  const session_id = "action_session";
  const store = new JsonlSessionHistoryStore({
    rootPath: root_path,
    agentId: "action_agent",
    sessionId: session_id,
  });
  const composer = new JsonlSessionHistoryComposer({ store });

  await store.write_record(
    store.userText({
      text: "hello",
      metadata: { sessionId: session_id },
      id: "u:1",
    }),
  );
  await store.write_record(
    store.action({
      action: {
        id: "action:1",
        title: "Compacting session records",
        state: "running",
        turnId: "turn-1",
      },
      metadata: { sessionId: session_id },
    }),
  );
  await store.write_record(
    store.action({
      action: {
        id: "action:1",
        title: "Session records compacted",
        description: "Compacted earlier messages.",
        state: "completed",
        turnId: "turn-1",
      },
      metadata: { sessionId: session_id },
    }),
  );
  await store.write_record(
    store.assistantText({
      text: "world",
      metadata: { sessionId: session_id },
      id: "a:1",
    }),
  );

  const persisted_messages = await store.list_records();
  assert.equal(persisted_messages.length, 3);
  assert.equal(persisted_messages[1].type, "action");
  assert.equal(persisted_messages[1].title, "Session records compacted");
  assert.equal(persisted_messages[1].description, "Compacted earlier messages.");
  assert.equal(persisted_messages[1].state, "completed");

  const model_messages = await composer.prepare({
    query: "",
    tools: {},
    system: [],
    model: {},
    retryCount: 0,
  });
  assert.deepEqual(
    model_messages.map((message) => message.id),
    ["u:1", "a:1"],
  );

  const timeline_events = toSessionTimelineEvents(persisted_messages[1]);
  assert.equal(timeline_events.length, 1);
  assert.equal(timeline_events[0].role, "action");
  assert.equal(timeline_events[0].actionTitle, "Session records compacted");
  assert.equal(timeline_events[0].actionDescription, "Compacted earlier messages.");
  assert.equal(timeline_events[0].actionState, "completed");
  assert.equal(
    timeline_events[0].text,
    "Session records compacted\nCompacted earlier messages.",
  );
});

test("session.set persists and publishes model-switching actions", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-model-switching-"),
  );
  const agent = new Agent({
    id: "model_switching_agent",
    path: agent_path,
  });
  try {
    const session = await agent.sessions.create({
      sessionId: "model_switching_session",
    });
    const events = [];
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "action") events.push(event);
    });

    await session.set({
      model: {
        modelId: "test-model",
        provider: "test",
      },
    });
    unsubscribe();

    assert.deepEqual(
      events.map((event) => `${event.title}:${event.state}`),
      ["Switching session model:running", "Session model switched:completed"],
    );
    assert.equal(new Set(events.map((event) => event.id)).size, 1);

    const records = await session.records({ view: "timeline" });
    const action_events = records.items.filter(
      (item) => item.role === "action",
    );
    assert.deepEqual(
      action_events.map((event) => `${event.actionTitle}:${event.actionState}`),
      ["Session model switched:completed"],
    );
  } finally {
    await agent.dispose();
  }
});

test("session.fork persists and publishes history-forking actions on source session", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-history-forking-"),
  );
  const agent = new Agent({
    id: "history_forking_agent",
    path: agent_path,
  });
  try {
    const session = await agent.sessions.create({
      sessionId: "history_forking_session",
    });
    await session.set({
      model: {
        modelId: "fork-test-model",
        provider: "test",
      },
    });
    await session.append_user_message({ text: "source message" });

    const events = [];
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "action") {
        events.push(event);
      }
    });
    const forked = await session.fork();
    unsubscribe();

    assert.deepEqual(
      events.map((event) => `${event.title}:${event.state}`),
      ["Forking session records:running", "Session records forked:completed"],
    );
    assert.equal(new Set(events.map((event) => event.id)).size, 1);
    assert.notEqual(forked.id, session.id);

    const source_records = await session.records({ view: "timeline" });
    const source_fork_actions = source_records.items.filter(
      (item) => item.role === "action" && item.actionTitle === "Session records forked",
    );
    assert.deepEqual(
      source_fork_actions.map((event) => event.actionState),
      ["completed"],
    );

    const forked_records = await forked.records({ view: "timeline" });
    const forked_model_actions = forked_records.items.filter(
      (item) => item.role === "action" && item.actionTitle === "Session model switched",
    );
    assert.equal(forked_model_actions.length, 1);
  } finally {
    await agent.dispose();
  }
});
