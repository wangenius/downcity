/**
 * @file 验证 Agent 配置与 steer 在 Session step 检查点统一生效。
 *
 * 关键点（中文）
 * - 第一次 provider 请求保持阻塞，用来制造真实的运行中配置修改窗口。
 * - Agent instruction 修改不能改变已有 Session；env 与 plugin registry 修改在 step 检查点生效。
 * - config 与 steer 在同一个 Session step 检查点提交，并继续使用同一个 turn id。
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

test("Agent instruction changes only affect newly created Sessions", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-config-turn-boundary-"),
  );
  const first_provider_request_started = create_deferred();
  const release_first_provider_request = create_deferred();
  const provider_prompts = [];
  let provider_request_count = 0;
  let plugin_stop_count = 0;

  const model = new MockLanguageModelV3({
    modelId: "config-turn-boundary-model",
    doStream: async (options) => {
      const has_tools = Array.isArray(options.tools) && options.tools.length > 0;
      if (!has_tools) return create_stream_text_result("Session title");
      provider_request_count += 1;
      provider_prompts.push(JSON.stringify(options.prompt));
      if (provider_request_count === 1) {
        first_provider_request_started.resolve();
        await release_first_provider_request.promise;
      }
      return create_stream_text_result(`done:${String(provider_request_count)}`);
    },
  });
  const runtime_plugin = createPlugin({
    name: "runtime-config",
    title: "Runtime Config",
    description: "Provides a system block for turn-boundary tests",
    lifecycle: {
      stop: async () => {
        plugin_stop_count += 1;
      },
    },
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
    await first_provider_request_started.promise;

    agent.setInstruction(["instruction:new"]);
    agent.patchEnv({ TURN_ENV: "new" });
    await agent.plugins.unregister("runtime-config");
    const steer_turn_promise = session.prompt({ query: "steer" });

    assert.equal(plugin_stop_count, 0);
    assert.equal(provider_prompts.length, 1);
    assert.match(provider_prompts[0], /instruction:old/);
    assert.match(provider_prompts[0], /plugin-env:old/);
    assert.doesNotMatch(provider_prompts[0], /instruction:new/);

    release_first_provider_request.resolve();
    const steer_turn = await steer_turn_promise;
    assert.equal((await first_turn.finished).success, true);
    assert.equal(steer_turn.id, first_turn.id);
    assert.equal((await steer_turn.finished).success, true);
    assert.equal(plugin_stop_count, 1);
    assert.equal(provider_prompts.length, 2);
    assert.match(provider_prompts[1], /instruction:old/);
    assert.doesNotMatch(provider_prompts[1], /instruction:new/);
    assert.doesNotMatch(provider_prompts[1], /plugin-env:old/);

    const messages = await session.messages();
    const completed_actions = messages.items
      .filter((message) => message.type === "action" && message.status === "completed")
      .map((message) => message.title);
    assert.deepEqual(completed_actions, [
      "Agent environment updated",
      "Agent plugin runtime-config unregistered",
    ]);

    // 未显式 snapshot 的 Session 重新装载时使用 Agent 当前 instruction。
    await agent.sessions.clear_messages(session.id);
    const restored_session = await agent.sessions.get(session.id);
    const restored_system = await restored_session.system();
    const restored_system_text = restored_system.blocks
      .map((block) => block.content)
      .join("\n");
    assert.match(restored_system_text, /instruction:new/);
    assert.doesNotMatch(restored_system_text, /instruction:old/);

    const new_session = await agent.sessions.create({
      sessionId: "config_turn_boundary_new_session",
    });
    const new_system = await new_session.system();
    const new_system_text = new_system.blocks
      .map((block) => block.content)
      .join("\n");
    assert.match(new_system_text, /instruction:new/);
    assert.doesNotMatch(new_system_text, /instruction:old/);
  } finally {
    release_first_provider_request.resolve();
    await agent.dispose();
  }
});

test("Session snapshot explicitly persists instruction.md", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-instruction-restart-"),
  );
  const model = new MockLanguageModelV3({ modelId: "instruction-restart-model" });
  const first_agent = new Agent({
    id: "instruction_restart_agent",
    path: agent_path,
    model,
    instruction: ["instruction:old"],
  });

  try {
    const session = await first_agent.sessions.create({
      sessionId: "instruction_restart_session",
    });
    const first_system = await session.system();
    assert.match(
      first_system.blocks.map((block) => block.content).join("\n"),
      /instruction:old/,
    );
    await session.snapshot();

    const instruction_path = path.join(
      agent_path,
      ".downcity",
      "agents",
      "instruction_restart_agent",
      "sessions",
      "instruction_restart_session",
      "instruction.md",
    );
    assert.equal(await fs.readFile(instruction_path, "utf8"), "instruction:old");

    await fs.writeFile(instruction_path, "instruction:manual", "utf8");
    await session.snapshot();
    assert.equal(await fs.readFile(instruction_path, "utf8"), "instruction:old");
  } finally {
    await first_agent.dispose();
  }

  const restarted_agent = new Agent({
    id: "instruction_restart_agent",
    path: agent_path,
    model,
    instruction: ["instruction:new"],
  });
  try {
    const restored_session = await restarted_agent.sessions.get(
      "instruction_restart_session",
    );
    const restored_system = await restored_session.system();
    const restored_system_text = restored_system.blocks
      .map((block) => block.content)
      .join("\n");
    assert.match(restored_system_text, /instruction:old/);
    assert.doesNotMatch(restored_system_text, /instruction:new/);
  } finally {
    await restarted_agent.dispose();
  }

  const instruction_path = path.join(
    agent_path,
    ".downcity",
    "agents",
    "instruction_restart_agent",
    "sessions",
    "instruction_restart_session",
    "instruction.md",
  );
  await fs.rm(instruction_path);

  const fallback_agent = new Agent({
    id: "instruction_restart_agent",
    path: agent_path,
    model,
    instruction: ["instruction:new"],
  });
  try {
    const fallback_session = await fallback_agent.sessions.get(
      "instruction_restart_session",
    );
    const fallback_system = await fallback_session.system();
    const fallback_system_text = fallback_system.blocks
      .map((block) => block.content)
      .join("\n");
    assert.match(fallback_system_text, /instruction:new/);
    assert.doesNotMatch(fallback_system_text, /instruction:old/);
  } finally {
    await fallback_agent.dispose();
    await fs.rm(agent_path, { recursive: true, force: true });
  }
});

test("empty Session snapshot suppresses Agent instruction after restart", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-empty-instruction-snapshot-"),
  );
  const model = new MockLanguageModelV3({ modelId: "empty-snapshot-model" });
  const first_agent = new Agent({
    id: "empty_snapshot_agent",
    path: agent_path,
    model,
  });
  try {
    const session = await first_agent.sessions.create({
      sessionId: "empty_snapshot_session",
    });
    await session.snapshot();
  } finally {
    await first_agent.dispose();
  }

  const restarted_agent = new Agent({
    id: "empty_snapshot_agent",
    path: agent_path,
    model,
    instruction: ["instruction:must-not-appear"],
  });
  try {
    const session = await restarted_agent.sessions.get("empty_snapshot_session");
    const system = await session.system();
    assert.doesNotMatch(
      system.blocks.map((block) => block.content).join("\n"),
      /instruction:must-not-appear/,
    );
  } finally {
    await restarted_agent.dispose();
    await fs.rm(agent_path, { recursive: true, force: true });
  }
});

test("running session model changes apply with steer at the next Session step", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-session-step-boundary-"),
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
    id: "session_step_boundary_agent",
    path: agent_path,
    model: old_model,
    plugins: [runtime_plugin],
  });

  try {
    const session = await agent.sessions.create({
      sessionId: "session_step_boundary_session",
    });
    const first_turn = await session.prompt({ query: "first" });
    await old_model_started.promise;

    await session.set({ model: new_model });
    const steer_turn_promise = session.prompt({ query: "continue" });
    assert.deepEqual(model_calls, ["old-model"]);

    release_old_model.resolve();
    const steer_turn = await steer_turn_promise;
    assert.equal((await first_turn.finished).success, true);
    assert.equal(steer_turn.id, first_turn.id);
    assert.equal((await steer_turn.finished).success, true);
    assert.deepEqual(model_calls, ["old-model", "new-model"]);

    const messages = await session.messages();
    const model_actions = messages.items.filter(
      (message) =>
        message.type === "action" &&
        message.title === "Session model switched from old-model to new-model",
    );
    assert.deepEqual(model_actions, []);
  } finally {
    release_old_model.resolve();
    await agent.dispose();
  }
});

test("config remains effective when its action message cannot be persisted", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-config-action-observability-"),
  );
  const model_calls = [];
  const old_model = new MockLanguageModelV3({
    modelId: "old-observability-model",
    doStream: async () => {
      model_calls.push("old");
      return create_stream_text_result("old");
    },
  });
  const new_model = new MockLanguageModelV3({
    modelId: "new-observability-model",
    doStream: async () => {
      model_calls.push("new");
      return create_stream_text_result("new");
    },
  });
  const agent = new Agent({
    id: "config_action_observability_agent",
    path: agent_path,
    model: old_model,
  });

  try {
    const session = await agent.sessions.create({
      sessionId: "config_action_observability_session",
    });
    session.emit_action_event = async () => {
      throw new Error("action store unavailable");
    };

    await session.set({ model: new_model });
    const turn = await session.prompt({ query: "use configured model" });
    assert.equal((await turn.finished).success, true);
    assert.deepEqual(model_calls, ["new", "new"]);

    const messages = await session.messages();
    assert.equal(messages.items.some((message) => message.type === "action"), false);
  } finally {
    await agent.dispose();
  }
});
