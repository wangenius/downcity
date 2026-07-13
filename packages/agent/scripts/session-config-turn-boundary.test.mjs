/**
 * @file 验证 Agent 配置在运行中修改后统一于下一模型 turn 生效。
 *
 * 关键点（中文）
 * - 第一轮 provider 请求保持阻塞，用来制造真实的运行中配置修改窗口。
 * - instruction、env 与 plugin registry 修改不能改变已经开始的请求。
 * - 下一模型 turn 统一提交配置，并通过 Session action message 表达生效。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { MockLanguageModelV3 } from "ai/test";
import { Agent } from "../bin/index.js";
import {
  createAction,
  createPlugin,
} from "../bin/plugin/core/PluginActionFactory.js";

function create_deferred() {
  let resolve;
  const promise = new Promise((inner_resolve) => {
    resolve = inner_resolve;
  });
  return { promise, resolve };
}

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

test("running Agent config changes become effective together at the next model turn", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-config-turn-boundary-"),
  );
  const first_model_turn_started = create_deferred();
  const release_first_model_turn = create_deferred();
  const provider_prompts = [];
  let provider_turn_count = 0;

  const model = new MockLanguageModelV3({
    modelId: "config-turn-boundary-model",
    doStream: async (options) => {
      const has_tools = Array.isArray(options.tools) && options.tools.length > 0;
      if (!has_tools) return create_stream_text_result("Session title");
      provider_turn_count += 1;
      provider_prompts.push(JSON.stringify(options.prompt));
      if (provider_turn_count === 1) {
        first_model_turn_started.resolve();
        await release_first_model_turn.promise;
      }
      return create_stream_text_result(`done:${String(provider_turn_count)}`);
    },
  });
  const runtime_plugin = createPlugin({
    name: "runtime-config",
    title: "Runtime Config",
    description: "Provides a system block for turn-boundary tests",
    system: (context) => `plugin-env:${context.env.TURN_ENV || "missing"}`,
    actions: {
      ping: createAction({
        description: "Ping",
        execute: async () => ({ success: true, data: { ok: true } }),
      }),
    },
  });
  const agent = new Agent({
    id: "config_turn_boundary_agent",
    path: agent_path,
    model,
    instruction: ["instruction:old"],
    env: { TURN_ENV: "old" },
    plugins: [runtime_plugin],
  });

  try {
    const session = await agent.sessions.create({
      sessionId: "config_turn_boundary_session",
    });
    const first_turn = await session.prompt({ query: "first" });
    await first_model_turn_started.promise;

    agent.setInstruction(["instruction:new"]);
    agent.patchEnv({ TURN_ENV: "new" });
    await agent.plugins.unregister("runtime-config");

    assert.equal(provider_prompts.length, 1);
    assert.match(provider_prompts[0], /instruction:old/);
    assert.match(provider_prompts[0], /plugin-env:old/);
    assert.doesNotMatch(provider_prompts[0], /instruction:new/);

    release_first_model_turn.resolve();
    assert.equal((await first_turn.finished).success, true);

    const second_turn = await session.prompt({ query: "second" });
    assert.equal((await second_turn.finished).success, true);
    assert.equal(provider_prompts.length, 2);
    assert.match(provider_prompts[1], /instruction:new/);
    assert.doesNotMatch(provider_prompts[1], /instruction:old/);
    assert.doesNotMatch(provider_prompts[1], /plugin-env:old/);

    const messages = await session.messages();
    const completed_actions = messages.items
      .filter((message) => message.type === "action" && message.status === "completed")
      .map((message) => message.title);
    assert.deepEqual(completed_actions, [
      "Agent instruction updated",
      "Agent environment updated",
      "Agent plugin runtime-config unregistered",
    ]);
  } finally {
    release_first_model_turn.resolve();
    await agent.dispose();
  }
});

test("running session model changes keep the current provider and switch the next model turn", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-session-model-turn-boundary-"),
  );
  const old_model_started = create_deferred();
  const release_old_model = create_deferred();
  const model_calls = [];

  const old_model = new MockLanguageModelV3({
    modelId: "old-model",
    doStream: async (options) => {
      const has_tools = Array.isArray(options.tools) && options.tools.length > 0;
      if (!has_tools) return create_stream_text_result("Old title");
      model_calls.push("old-model");
      old_model_started.resolve();
      await release_old_model.promise;
      return create_stream_text_result("old response");
    },
  });
  const new_model = new MockLanguageModelV3({
    modelId: "new-model",
    doStream: async (options) => {
      const has_tools = Array.isArray(options.tools) && options.tools.length > 0;
      if (!has_tools) return create_stream_text_result("New title");
      model_calls.push("new-model");
      return create_stream_text_result("new response");
    },
  });
  const runtime_plugin = createPlugin({
    name: "model-boundary",
    title: "Model Boundary",
    description: "Ensures the main provider request has tools",
    actions: {
      ping: createAction({
        description: "Ping",
        execute: async () => ({ success: true, data: { ok: true } }),
      }),
    },
  });
  const agent = new Agent({
    id: "session_model_turn_boundary_agent",
    path: agent_path,
    model: old_model,
    plugins: [runtime_plugin],
  });

  try {
    const session = await agent.sessions.create({
      sessionId: "session_model_turn_boundary_session",
    });
    const first_turn = await session.prompt({ query: "first" });
    await old_model_started.promise;

    await session.set({ model: new_model });
    assert.deepEqual(model_calls, ["old-model"]);

    release_old_model.resolve();
    assert.equal((await first_turn.finished).success, true);
    assert.deepEqual(model_calls, ["old-model"]);

    const second_turn = await session.prompt({ query: "second" });
    assert.equal((await second_turn.finished).success, true);
    assert.deepEqual(model_calls, ["old-model", "new-model"]);

    const messages = await session.messages();
    const model_actions = messages.items.filter(
      (message) =>
        message.type === "action" &&
        message.title === "Session model switched from old-model to new-model",
    );
    assert.deepEqual(
      model_actions.map((message) => message.status),
      ["completed"],
    );
  } finally {
    release_old_model.resolve();
    await agent.dispose();
  }
});
