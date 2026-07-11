/**
 * @file 验证 RemoteSession 在事件连接断开后能够重新建立订阅。
 *
 * 关键点（中文）
 * - 断流必须结束当前 pending turn，避免 finished 永久等待。
 * - 下一次 prompt 必须重新调用 transport.subscribe。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { RemoteSession } from "../bin/agent/remote/RemoteSession.js";

test("RemoteSession reconnects the event pump after transport close", async () => {
  const subscriptions = [];
  let prompt_count = 0;
  const transport = {
    async subscribe(input) {
      subscriptions.push(input);
      input.on_ready();
      return { close: async () => {} };
    },
    async prompt() {
      prompt_count += 1;
      return { id: `turn_${prompt_count}` };
    },
    async get_info() {
      throw new Error("unused");
    },
    async stop() {
      return { stopped: false, cancelledQueuedPrompts: 0, reason: "idle" };
    },
    async records() {
      throw new Error("unused");
    },
    async system() {
      throw new Error("unused");
    },
    async fork() {
      throw new Error("unused");
    },
  };
  const session = new RemoteSession(transport, {
    agentId: "agent_test",
    sessionId: "session_test",
    messageCount: 0,
  });

  const first_turn = await session.prompt({ query: "first" });
  subscriptions[0].on_close(new Error("stream dropped"));
  assert.deepEqual(await first_turn.finished, {
    turnId: "turn_1",
    text: "",
    success: false,
    error: "stream dropped",
  });

  const second_turn = await session.prompt({ query: "second" });
  assert.equal(subscriptions.length, 2);
  subscriptions[1].on_event({
    type: "turn-finish",
    turnId: second_turn.id,
    text: "done",
    success: true,
  });
  assert.equal((await second_turn.finished).text, "done");
});

test("RemoteSession switches models by stable id without local model instances", async () => {
  const updates = [];
  const transport = {
    async set(_session_id, input) {
      updates.push(input);
      return {
        agentId: "agent_test",
        sessionId: "session_test",
        messageCount: 0,
        modelId: input.modelId,
        modelLabel: input.modelId,
      };
    },
  };
  const session = new RemoteSession(transport, {
    agentId: "agent_test",
    sessionId: "session_test",
    messageCount: 0,
    modelId: "old-model",
    modelLabel: "old-model",
  });

  await session.set({ modelId: "next-model" });

  assert.deepEqual(updates, [{ modelId: "next-model" }]);
  assert.equal(session.config.modelId, "next-model");
  assert.equal(session.config.modelLabel, "next-model");
  await assert.rejects(
    session.set({ model: { modelId: "local-model", provider: "test" } }),
    /does not accept a local model instance/,
  );
});
