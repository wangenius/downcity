/**
 * @file 验证 operation message 的持久化、模型输入过滤与 timeline 投影。
 *
 * 关键点（中文）
 * - operation message 会作为 operation role 消息写入 JSONL。
 * - history composer 组装 LLM 输入时必须过滤 operation message。
 * - timeline view 可以把 operation message 投影成前端可识别的 operation 事件。
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

test("operation message is persisted but filtered from LLM history", async () => {
  const root_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-operation-message-"),
  );
  const session_id = "operation_session";
  const store = new JsonlSessionHistoryStore({
    rootPath: root_path,
    agentId: "operation_agent",
    sessionId: session_id,
  });
  const composer = new JsonlSessionHistoryComposer({ store });

  await store.append(
    store.userText({
      text: "hello",
      metadata: { sessionId: session_id },
      id: "u:1",
    }),
  );
  await store.append(
    store.operation({
      operation: {
        operationId: "op-1",
        name: "compacting",
        status: "finished",
        label: "Session history compacted",
        turnId: "turn-1",
      },
      metadata: { sessionId: session_id },
      id: "op:1",
    }),
  );
  await store.append(
    store.assistantText({
      text: "world",
      metadata: { sessionId: session_id },
      id: "a:1",
    }),
  );

  const persisted_messages = await store.list();
  assert.equal(persisted_messages.length, 3);
  assert.equal(persisted_messages[1].role, "operation");
  assert.equal(persisted_messages[1].metadata.kind, "operation");
  assert.equal(persisted_messages[1].metadata.operation.operationId, "op-1");

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
  assert.equal(timeline_events[0].role, "operation");
  assert.equal(timeline_events[0].operationId, "op-1");
  assert.equal(timeline_events[0].operationName, "compacting");
  assert.equal(timeline_events[0].operationStatus, "finished");
  assert.equal(timeline_events[0].text, "Session history compacted");

  const hidden_started_events = toSessionTimelineEvents(
    store.operation({
      operation: {
        operationId: "op-started",
        name: "compacting",
        status: "started",
        label: "Compacting session history",
      },
      metadata: { sessionId: session_id },
      id: "op:started",
    }),
  );
  assert.deepEqual(hidden_started_events, []);
});

test("session.set persists and publishes model-switching operations", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-model-switching-"),
  );
  const agent = new Agent({
    id: "model_switching_agent",
    path: agent_path,
  });
  try {
    const session = await agent.session_collection().create_session({
      sessionId: "model_switching_session",
    });
    const events = [];
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "operation") events.push(event);
    });

    await session.set({
      model: {
        modelId: "test-model",
        provider: "test",
      },
    });
    unsubscribe();

    assert.deepEqual(
      events.map((event) => `${event.name}:${event.status}`),
      ["model-switching:started", "model-switching:finished"],
    );

    const history = await session.history({ view: "timeline" });
    const operation_events = history.items.filter(
      (item) => item.role === "operation",
    );
    assert.deepEqual(
      operation_events.map((event) => `${event.operationName}:${event.operationStatus}`),
      ["model-switching:finished"],
    );
  } finally {
    await agent.dispose();
  }
});

test("session.fork persists and publishes history-forking operations on source session", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-history-forking-"),
  );
  const agent = new Agent({
    id: "history_forking_agent",
    path: agent_path,
  });
  try {
    const session = await agent.session_collection().create_session({
      sessionId: "history_forking_session",
    });
    await session.set({
      model: {
        modelId: "fork-test-model",
        provider: "test",
      },
    });
    await session.appendUserMessage({ text: "source message" });

    const events = [];
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "operation" && event.name === "history-forking") {
        events.push(event);
      }
    });
    const forked = await session.fork();
    unsubscribe();

    assert.deepEqual(
      events.map((event) => `${event.name}:${event.status}`),
      ["history-forking:started", "history-forking:finished"],
    );
    assert.notEqual(forked.id, session.id);

    const source_history = await session.history({ view: "timeline" });
    const source_fork_operations = source_history.items.filter(
      (item) => item.operationName === "history-forking",
    );
    assert.deepEqual(
      source_fork_operations.map((event) => event.operationStatus),
      ["finished"],
    );

    const forked_history = await forked.history({ view: "timeline" });
    const forked_model_operations = forked_history.items.filter(
      (item) => item.operationName === "model-switching",
    );
    assert.equal(forked_model_operations.length, 1);
  } finally {
    await agent.dispose();
  }
});
