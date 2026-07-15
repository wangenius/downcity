/**
 * @file 验证 CityModel 会优先走 OpenAI-compatible LanguageModel 并完成 tool loop。
 *
 * 关键点（中文）
 * - 这里直接走编译后的 Agent 产物，避免测试只覆盖源码级辅助函数。
 * - CityModel 使用 @downcity/type 的共享协议构造，避免反向依赖 City SDK 实现。
 * - 重点锁住 CityModel -> LanguageModel -> tool-call -> 本地执行 -> tool-result 回传链路。
 * - 新路径不应再调用 `/v1/ai/stream`，避免 UIMessage stream 反向适配丢失 finish 语义。
 */

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { Agent } from "../bin/index.js";
import { createAction, createPlugin } from "../bin/plugin/core/PluginActionFactory.js";
import { CITY_MODEL_INVOKER, CITY_MODEL_KIND } from "@downcity/type";
import { tool } from "ai";
import { z } from "zod";

function write_openai_sse(res, chunks) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const chunk of chunks) {
    const payload = typeof chunk === "string" ? chunk : JSON.stringify(chunk);
    res.write(`data: ${payload}\n\n`);
  }
  res.end();
}

async function read_json_body(req) {
  const raw = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
  return JSON.parse(String(raw || "{}"));
}

test("CityModel uses direct LanguageModel path and sends tool result back", async () => {
  const agent_requests = [];
  let stream_requests = 0;
  let tool_executed = false;

  const server = http.createServer(async (req, res) => {
    const url = new URL(String(req.url || "/"), "http://127.0.0.1");

    if (req.method === "POST" && url.pathname === "/v1/ai/stream") {
      stream_requests += 1;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "legacy stream endpoint should not be called" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/ai/chat/completions") {
      const body = await read_json_body(req);

      if (!Array.isArray(body.tools)) {
        write_openai_sse(res, [
          {
            id: "chatcmpl_title",
            object: "chat.completion.chunk",
            created: 1,
            model: "mock-model",
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "Tool loop" },
                finish_reason: null,
              },
            ],
          },
          {
            id: "chatcmpl_title",
            object: "chat.completion.chunk",
            created: 1,
            model: "mock-model",
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
        return;
      }

      agent_requests.push(body);
      if (agent_requests.length === 1) {
        write_openai_sse(res, [
          {
            id: "chatcmpl_1",
            object: "chat.completion.chunk",
            created: 1,
            model: "mock-model",
            choices: [
              {
                index: 0,
                delta: { role: "assistant" },
                finish_reason: null,
              },
            ],
          },
          {
            id: "chatcmpl_1",
            object: "chat.completion.chunk",
            created: 1,
            model: "mock-model",
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "ping",
                        arguments: "{\"value\":\"hello\"}",
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            id: "chatcmpl_1",
            object: "chat.completion.chunk",
            created: 1,
            model: "mock-model",
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
        return;
      }

      write_openai_sse(res, [
        {
          id: "chatcmpl_2",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [
            {
              index: 0,
              delta: { role: "assistant" },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl_2",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [
            {
              index: 0,
              delta: { content: "done" },
              finish_reason: null,
            },
          ],
        },
        {
          id: "chatcmpl_2",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
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
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  let agent;
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const model = Object.freeze({
      id: "mock-model",
      name: "Mock Model",
      description: "mock",
      modalities: ["text", "stream"],
      tags: [],
      meta: {},
      kind: CITY_MODEL_KIND,
      [CITY_MODEL_INVOKER]: {
        connection: () => ({
          base_url: `http://127.0.0.1:${String(address.port)}/v1/ai`,
          api_key: "ub_test",
          model_id: "mock-model",
        }),
      },
    });

    const agent_path = await fs.mkdtemp(
      path.join(os.tmpdir(), "downcity-agent-city-model-tool-loop-"),
    );
    const skill_plugin = createPlugin({
      name: "skill",
      title: "Skill",
      description: "Test skill plugin",
      actions: {
        lookup: createAction({
          description: "Lookup a skill",
          execute: async ({ input }) => ({
            success: true,
            data: { name: input.name },
            message: "loaded",
          }),
        }),
      },
    });
    agent = new Agent({
      id: "tool_loop_agent",
      path: agent_path,
      plugins: [skill_plugin],
      tools: {
        ping: tool({
          description: "ping tool",
          inputSchema: z.object({
            value: z.string(),
          }),
          execute: async ({ value }, options) => {
            tool_executed = true;
            options.experimental_context.session_run_context.pendingAssistantFileParts.push({
              type: "file",
              mediaType: "image/png",
              url: ".downcity/resources/tool-output.png",
              filename: "tool-output.png",
            });
            return { echoed: value };
          },
        }),
      },
    });

    const session = await agent.sessions.create();
    await session.set({ model });
    const turn = await session.prompt({ query: "please use the ping tool" });
    const result = await turn.finished;

    assert.equal(result.success, true);
    assert.equal(tool_executed, true);
    assert.equal(stream_requests, 0);
    assert.equal(agent_requests.length, 2);
    assert.equal(agent_requests[0]?.model, "mock-model");
    const plugin_call_tool = agent_requests[0]?.tools?.find(
      (item) => item?.type === "function" && item?.function?.name === "plugin_call",
    );
    assert.ok(plugin_call_tool);
    const plugin_call_parameters = plugin_call_tool.function.parameters;
    assert.equal(plugin_call_parameters.type, "object");
    assert.deepEqual(plugin_call_parameters.required, ["plugin", "action"]);
    assert.equal(plugin_call_parameters.additionalProperties, false);
    assert.equal(
      plugin_call_parameters.properties.payload.additionalProperties,
      true,
    );

    const second_request_messages = Array.isArray(agent_requests[1]?.messages)
      ? agent_requests[1].messages
      : [];
    const serialized_second_messages = JSON.stringify(second_request_messages);
    assert.match(serialized_second_messages, /"role":"tool"/);
    assert.match(serialized_second_messages, /call_1/);
    assert.match(serialized_second_messages, /echoed/);
    assert.match(serialized_second_messages, /hello/);

    const result_file = result.assistantMessage.parts.find(
      (part) => part.type === "file",
    );
    assert.deepEqual(result_file, {
      type: "file",
      mediaType: "image/png",
      url: ".downcity/resources/tool-output.png",
      filename: "tool-output.png",
    });
    const session_messages = await session.messages({ include_internal: true });
    const persisted_assistant = session_messages.items.find(
      (message) => message.type === "assistant",
    );
    const persisted_file = persisted_assistant.parts.find(
      (part) => part.type === "file",
    );
    assert.deepEqual(persisted_file, {
      part_id: persisted_file.part_id,
      sequence: persisted_file.sequence,
      type: "file",
      media_type: "image/png",
      url: ".downcity/resources/tool-output.png",
      filename: "tool-output.png",
    });
  } finally {
    if (agent) {
      await agent.dispose();
    }
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});
