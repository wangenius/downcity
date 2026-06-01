/**
 * @file 验证 CityModel 适配层会把本地 tool result 带回下一轮请求。
 *
 * 关键点（中文）
 * - 这里直接走编译后的 Agent / City 产物，避免测试只覆盖源码级辅助函数。
 * - 重点锁住 CityModelAdapter 的 tool-call -> 本地执行 -> tool-result 回传链路。
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

function write_sse(res, chunks) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-vercel-ai-ui-message-stream": "v1",
  });
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
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

test("CityModel sends tool result back on the next round", async () => {
  const requests = [];
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
      const body = await read_json_body(req);
      requests.push(body);

      if (requests.length === 1) {
        write_sse(res, [
          { type: "start", messageId: "msg_1" },
          { type: "tool-input-start", toolCallId: "call_1", toolName: "ping" },
          {
            type: "tool-input-available",
            toolCallId: "call_1",
            toolName: "ping",
            input: { value: "hello" },
          },
          { type: "finish", finishReason: "tool-calls" },
        ]);
        return;
      }

      write_sse(res, [
        { type: "start", messageId: "msg_2" },
        { type: "text-start", id: "text_2" },
        { type: "text-delta", id: "text_2", delta: "done" },
        { type: "text-end", id: "text_2" },
        { type: "finish", finishReason: "stop" },
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
    assert.equal(requests.length, 2);

    const second_request_messages = Array.isArray(requests[1]?.messages)
      ? requests[1].messages
      : [];
    const second_assistant_message = second_request_messages.find(
      (message) => message && message.role === "assistant",
    );
    assert.ok(second_assistant_message);
    const second_assistant_parts = Array.isArray(second_assistant_message.parts)
      ? second_assistant_message.parts
      : [];

    const tool_call_part = second_assistant_parts.find(
      (part) => part && part.type === "dynamic-tool" && part.state === "output-available",
    );
    assert.deepEqual(tool_call_part, {
      type: "dynamic-tool",
      toolName: "ping",
      toolCallId: "call_1",
      state: "output-available",
      input: { value: "hello" },
      output: { echoed: "hello" },
      providerExecuted: false,
    });
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
