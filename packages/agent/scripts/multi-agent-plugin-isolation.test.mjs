/**
 * @file 验证多个 Agent 经 session.prompt 执行 plugin_call 时保持 registry 隔离。
 *
 * 关键点（中文）
 * - 先创建 Agent A，再创建 Agent B，锁住历史全局 runtime 的覆盖顺序。
 * - 两个 Session 并发进入模型 tool loop，验证异步作用域不会造成 registry 串线。
 * - 第二次模型请求必须收到各自 plugin action 返回的 owner。
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { Agent } from "../bin/index.js";
import {
  createAction,
  createPlugin,
} from "../bin/plugin/core/PluginActionFactory.js";
import { CITY_MODEL_INVOKER, CITY_MODEL_KIND } from "@downcity/type";

/**
 * 写入一组 OpenAI-compatible SSE chunk。
 */
function write_openai_sse(response, chunks) {
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const chunk of chunks) {
    const payload = typeof chunk === "string" ? chunk : JSON.stringify(chunk);
    response.write(`data: ${payload}\n\n`);
  }
  response.end();
}

/**
 * 读取 HTTP JSON 请求体。
 */
async function read_json_body(request) {
  const raw = await new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
  return JSON.parse(String(raw || "{}"));
}

/**
 * 返回普通文本模型流。
 */
function write_text_response(response, input) {
  write_openai_sse(response, [
    {
      id: input.id,
      object: "chat.completion.chunk",
      created: 1,
      model: input.model,
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: input.text },
          finish_reason: null,
        },
      ],
    },
    {
      id: input.id,
      object: "chat.completion.chunk",
      created: 1,
      model: input.model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "stop",
        },
      ],
    },
    "[DONE]",
  ]);
}

/**
 * 返回一次 plugin_call tool call。
 */
function write_plugin_call_response(response, model) {
  write_openai_sse(response, [
    {
      id: `chatcmpl_${model}_tool`,
      object: "chat.completion.chunk",
      created: 1,
      model,
      choices: [
        {
          index: 0,
          delta: { role: "assistant" },
          finish_reason: null,
        },
      ],
    },
    {
      id: `chatcmpl_${model}_tool`,
      object: "chat.completion.chunk",
      created: 1,
      model,
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: `call_${model}`,
                type: "function",
                function: {
                  name: "plugin_call",
                  arguments: JSON.stringify({
                    plugin: "skill",
                    action: "lookup",
                    payload: {},
                  }),
                },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id: `chatcmpl_${model}_tool`,
      object: "chat.completion.chunk",
      created: 1,
      model,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: "tool_calls",
        },
      ],
    },
    "[DONE]",
  ]);
}

/**
 * 创建绑定测试 HTTP 服务的 CityModel。
 */
function create_test_model(base_url, model_id) {
  return Object.freeze({
    id: model_id,
    name: model_id,
    description: "Multi-agent plugin isolation model",
    modalities: ["text", "stream"],
    tags: [],
    meta: {},
    kind: CITY_MODEL_KIND,
    [CITY_MODEL_INVOKER]: {
      connection: () => ({
        base_url,
        api_key: "test_key",
        model_id,
      }),
    },
  });
}

/**
 * 创建返回固定 owner 的 skill plugin。
 */
function create_owner_plugin(owner, executed_owners) {
  return createPlugin({
    name: "skill",
    title: `Skill ${owner}`,
    description: "Return the owning Agent id",
    actions: {
      lookup: createAction({
        description: "Return registry owner",
        execute: async () => {
          executed_owners.push(owner);
          return {
            success: true,
            data: { owner },
            message: owner,
          };
        },
      }),
    },
  });
}

test("multiple session prompts use only their owning Agent plugin registry", async () => {
  const model_requests = new Map();
  const executed_owners = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(String(request.url || "/"), "http://127.0.0.1");
    if (
      request.method !== "POST" ||
      url.pathname !== "/v1/ai/chat/completions"
    ) {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    const body = await read_json_body(request);
    const model = String(body.model || "");
    if (!Array.isArray(body.tools)) {
      write_text_response(response, {
        id: `chatcmpl_${model}_title`,
        model,
        text: `Title ${model}`,
      });
      return;
    }

    const requests = model_requests.get(model) || [];
    requests.push(body);
    model_requests.set(model, requests);
    if (requests.length === 1) {
      write_plugin_call_response(response, model);
      return;
    }
    write_text_response(response, {
      id: `chatcmpl_${model}_done`,
      model,
      text: "done",
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base_url = `http://127.0.0.1:${String(address.port)}/v1/ai`;
  const root_a = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-plugin-isolation-a-"),
  );
  const root_b = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-plugin-isolation-b-"),
  );
  const agent_a = new Agent({
    id: "agent_a",
    path: root_a,
    plugins: [create_owner_plugin("agent_a", executed_owners)],
    model: create_test_model(base_url, "model_a"),
  });
  const agent_b = new Agent({
    id: "agent_b",
    path: root_b,
    plugins: [create_owner_plugin("agent_b", executed_owners)],
    model: create_test_model(base_url, "model_b"),
  });

  try {
    const session_a = await agent_a.sessions.create({ sessionId: "session_a" });
    const session_b = await agent_b.sessions.create({ sessionId: "session_b" });
    const [turn_a, turn_b] = await Promise.all([
      session_a.prompt({ query: "Call your skill plugin" }),
      session_b.prompt({ query: "Call your skill plugin" }),
    ]);
    const [result_a, result_b] = await Promise.all([
      turn_a.finished,
      turn_b.finished,
    ]);

    assert.equal(result_a.success, true);
    assert.equal(result_b.success, true);
    assert.deepEqual([...executed_owners].sort(), ["agent_a", "agent_b"]);
    for (const [model, owner] of [
      ["model_a", "agent_a"],
      ["model_b", "agent_b"],
    ]) {
      const requests = model_requests.get(model) || [];
      assert.equal(requests.length, 2);
      assert.match(JSON.stringify(requests[1].messages), new RegExp(owner));
    }
  } finally {
    await Promise.all([agent_a.dispose(), agent_b.dispose()]);
    await new Promise((resolve) => server.close(() => resolve()));
  }
});
