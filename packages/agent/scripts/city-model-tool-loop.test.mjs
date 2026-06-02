/**
 * @file 验证 CityModel 会优先走 OpenAI-compatible LanguageModel 并完成 tool loop。
 *
 * 关键点（中文）
 * - 这里直接走编译后的 Agent / City 产物，避免测试只覆盖源码级辅助函数。
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
import { City } from "../../city/bin/index.js";
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
  const requests = [];
  const agent_requests = [];
  let stream_requests = 0;
  let tool_executed = false;

  const server = http.createServer(async (req, res) => {
    const url = new URL(String(req.url || "/"), "http://127.0.0.1");

    if (req.method === "GET" && url.pathname === "/v1/ai/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        items: [
          {
            id: "mock-model",
            name: "Mock Model",
            description: "mock",
            modalities: ["text", "stream"],
            tags: [],
            meta: {},
            env: {},
          },
        ],
      }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/ai/stream") {
      stream_requests += 1;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "legacy stream endpoint should not be called" }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/ai/chat/completions") {
      const body = await read_json_body(req);
      requests.push(body);

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

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const city = new City({
      role: "user",
      city_url: `http://127.0.0.1:${String(address.port)}`,
      town_id: "town_demo",
      user_token: "ub_test",
    });
    const catalog = await city.ai.listModels();
    const model = catalog.get("mock-model");
    assert.ok(model);

    const agent_path = await fs.mkdtemp(
      path.join(os.tmpdir(), "downcity-agent-city-model-tool-loop-"),
    );
    const agent = new Agent({
      id: "tool_loop_agent",
      path: agent_path,
      tools: {
        ping: tool({
          description: "ping tool",
          inputSchema: z.object({
            value: z.string(),
          }),
          execute: async ({ value }) => {
            tool_executed = true;
            return { echoed: value };
          },
        }),
      },
    });

    const session = await agent.createSession();
    await session.set({ model });
    const turn = await session.prompt({ query: "please use the ping tool" });
    const result = await turn.finished;

    assert.equal(result.success, true);
    assert.equal(tool_executed, true);
    assert.equal(stream_requests, 0);
    assert.equal(agent_requests.length, 2);
    assert.equal(requests.every((request) => request?.town_id === "town_demo"), true);
    assert.equal(agent_requests[0]?.model, "mock-model");

    const second_request_messages = Array.isArray(agent_requests[1]?.messages)
      ? agent_requests[1].messages
      : [];
    const serialized_second_messages = JSON.stringify(second_request_messages);
    assert.match(serialized_second_messages, /"role":"tool"/);
    assert.match(serialized_second_messages, /call_1/);
    assert.match(serialized_second_messages, /echoed/);
    assert.match(serialized_second_messages, /hello/);
  } finally {
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
