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

test("session.set only persists and publishes model-switching actions when model changes", async () => {
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
      if (
        event.variant === "message" && event.type === "action"
      ) events.push(event.message);
    });

    await session.set({
      modelId: "test-model",
      model: {
        modelId: "test-model-label-v1",
        provider: "test",
      },
    });

    assert.deepEqual(events, []);

    await session.set({
      modelId: "test-model",
      model: {
        modelId: "test-model-label-v2",
        provider: "test",
      },
    });

    assert.deepEqual(events, []);

    await session.set({
      modelId: "next-test-model",
      model: {
        modelId: "next-test-model-label",
        provider: "test",
      },
    });
    unsubscribe();

    assert.deepEqual(
      events.map((event) => `${event.title}:${event.status}`),
      [
        "Switching session model from test-model-label-v2 to next-test-model-label:running",
        "Session model switched from test-model-label-v2 to next-test-model-label:completed",
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
        "Session model switched from test-model-label-v2 to next-test-model-label:completed",
      ],
    );
  } finally {
    await agent.dispose();
  }
});

test("default model initialization does not persist model-switching actions", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-model-init-action-"),
  );
  const agent = new Agent({
    id: "model_init_action_agent",
    path: agent_path,
    model: {
      modelId: "default-test-model",
      provider: "test",
    },
  });
  try {
    const session = await agent.sessions.create({
      sessionId: "model_init_action_session",
    });
    const messages = await session.messages();
    const action_events = messages.items.filter(
      (item) => item.type === "action",
    );
    assert.deepEqual(action_events, []);
  } finally {
    await agent.dispose();
  }
});

test("session model id persists and restores through the host resolver", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-session-model-id-"),
  );
  const resolved_model_ids = [];
  const resolve_model = async (model_id) => {
    resolved_model_ids.push(model_id);
    return {
      modelId: model_id,
      provider: "test",
    };
  };
  const first_agent = new Agent({
    id: "session_model_id_agent",
    path: agent_path,
    model: await resolve_model("default-model"),
    model_id: "default-model",
    resolve_model,
  });
  try {
    const session = await first_agent.sessions.create({
      sessionId: "persisted-model-session",
    });
    await session.set({ modelId: "session-model" });
    const info = await session.get_info();
    assert.equal(info.modelId, "session-model");
    assert.equal(session.config.modelId, "session-model");
  } finally {
    await first_agent.dispose();
  }

  const restored_agent = new Agent({
    id: "session_model_id_agent",
    path: agent_path,
    model: await resolve_model("other-default-model"),
    model_id: "other-default-model",
    resolve_model,
  });
  try {
    const restored_session = await restored_agent.sessions.get(
      "persisted-model-session",
    );
    assert.equal(restored_session.config.modelId, "session-model");
    assert.equal(restored_session.config.model.modelId, "session-model");
    assert.equal(resolved_model_ids.at(-1), "session-model");
  } finally {
    await restored_agent.dispose();
  }
});

test("runtime restoration does not publish a model switch when model id is unchanged", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-session-model-runtime-restore-"),
  );
  const first_agent = new Agent({
    id: "session_model_runtime_restore_agent",
    path: agent_path,
    model: {
      modelId: "default-model",
      provider: "test",
    },
    model_id: "default-model",
    resolve_model: async (model_id) => ({
      modelId: model_id,
      provider: "test",
    }),
  });
  try {
    const session = await first_agent.sessions.create({
      sessionId: "runtime-restored-model-session",
    });
    await session.set({ modelId: "session-model" });
  } finally {
    await first_agent.dispose();
  }

  let resolve_count = 0;
  const restored_agent = new Agent({
    id: "session_model_runtime_restore_agent",
    path: agent_path,
    model: {
      modelId: "other-default-model",
      provider: "test",
    },
    model_id: "other-default-model",
    resolve_model: async (model_id) => {
      resolve_count += 1;
      return {
        modelId: model_id,
        provider: "test",
      };
    },
  });
  try {
    const session_port = restored_agent
      .getContext()
      .session.get("runtime-restored-model-session");
    const events = [];
    const unsubscribe = session_port.subscribe((event) => {
      if (event.type === "action") events.push(event);
    });
    await session_port.stop();
    unsubscribe();

    assert.equal(resolve_count, 1);
    assert.deepEqual(events, []);
  } finally {
    await restored_agent.dispose();
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
