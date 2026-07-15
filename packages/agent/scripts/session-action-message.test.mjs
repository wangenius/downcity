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
import { MockLanguageModelV3 } from "ai/test";

function create_stream_text_result(text) {
  return {
    stream: new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({ type: "text-start", id: "text_1" });
        controller.enqueue({ type: "text-delta", id: "text_1", delta: text });
        controller.enqueue({ type: "text-end", id: "text_1" });
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 0,
              noCache: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 0,
              text: 0,
              reasoning: 0,
            },
          },
        });
        controller.close();
      },
    }),
  };
}

function create_model(model_id, calls) {
  return new MockLanguageModelV3({
    modelId: model_id,
    doStream: async () => {
      calls.push(model_id);
      return create_stream_text_result("done");
    },
  });
}

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

test("session.set only persists and publishes model-switching actions when model changes", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-model-switching-"),
  );
  const agent = new Agent({
    id: "model_switching_agent",
    path: agent_path,
  });
  const model_calls = [];
  try {
    const session = await agent.sessions.create({
      sessionId: "model_switching_session",
    });
    const events = [];
    const unsubscribe = session.subscribe((event) => {
      if (
        event.variant === "message" && event.type === "action"
      ) events.push(event.message);
    });

    await session.set({
      model: create_model("test-model-label", model_calls),
    });

    assert.deepEqual(events, []);

    await session.set({
      model: create_model("test-model-label", model_calls),
    });

    assert.deepEqual(events, []);

    await session.set({
      model: create_model("next-test-model-label", model_calls),
    });

    assert.deepEqual(events, []);
    assert.deepEqual(model_calls, []);

    const turn = await session.prompt({ query: "apply queued config" });
    const result = await turn.finished;
    unsubscribe();

    assert.equal(result.success, true);
    assert.deepEqual(model_calls, [
      "next-test-model-label",
      "next-test-model-label",
    ]);

    assert.deepEqual(
      events.map((event) => `${event.title}:${event.status}`),
      [
        "Session model switched from test-model-label to next-test-model-label:running",
        "Session model switched from test-model-label to next-test-model-label:completed",
      ],
    );
    assert.equal(new Set(events.map((event) => event.message_id)).size, 1);

    const messages = await session.messages();
    const action_events = messages.items.filter(
      (item) => item.type === "action",
    );
    assert.deepEqual(
      action_events.map((event) => `${event.title}:${event.status}`),
      [
        "Session model switched from test-model-label to next-test-model-label:completed",
      ],
    );
  } finally {
    await agent.dispose();
  }
});

test("session model overrides the Agent model for later turns", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-session-model-host-"),
  );
  const model_calls = [];
  const agent_model = create_model("host-model-a", model_calls);
  const agent = new Agent({
    id: "session_model_host_agent",
    path: agent_path,
    model: agent_model,
  });
  try {
    const session = await agent.sessions.create({
      sessionId: "host-model-session",
    });
    await (await session.prompt({ query: "first" })).finished;
    await session.set({
      model: create_model("session-model-b", model_calls),
    });
    await (await session.prompt({ query: "second" })).finished;
    assert.deepEqual(model_calls, [
      "host-model-a",
      "host-model-a",
      "session-model-b",
    ]);
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
      if (
        event.variant === "message" && event.type === "action"
      ) events.push(event.message);
    });
    const forked = await session.fork();
    unsubscribe();

    assert.deepEqual(
      events.map((event) => `${event.title}:${event.status}`),
      ["Forking session records:running", "Session records forked:completed"],
    );
    assert.equal(new Set(events.map((event) => event.message_id)).size, 1);
    assert.notEqual(forked.id, session.id);

    const source_messages = await session.messages();
    const source_fork_actions = source_messages.items.filter(
      (item) => item.type === "action" && item.title === "Session records forked",
    );
    assert.deepEqual(
      source_fork_actions.map((event) => event.status),
      ["completed"],
    );

    const forked_messages = await forked.messages();
    const forked_model_actions = forked_messages.items.filter(
      (item) => item.type === "action" && item.title.startsWith("Session model switched from "),
    );
    assert.equal(forked_model_actions.length, 0);
  } finally {
    await agent.dispose();
  }
});
