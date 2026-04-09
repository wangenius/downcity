/**
 * Console Inline 即时模式路由测试（node:test）。
 *
 * 关键点（中文）
 * - `/api/ui/inline/instant-run` 必须统一承接即时模式请求。
 * - `model / acp` 两类 executor 都应走同一条接口，只在参数校验上分流。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { registerConsoleInlineInstantRoutes } from "../../bin/main/modules/console/InlineInstantRoutes.js";

test("instant route forwards model executor payload to service", async () => {
  const app = new Hono();
  let captured = null;
  registerConsoleInlineInstantRoutes({
    app,
    async resolveAgentById() {
      return null;
    },
    instantSessionService: {
      async run(input) {
        captured = input;
        return {
          sessionId: "inline:instant:model:test",
          executorType: "model",
          modelId: input.modelId,
          text: "ok",
        };
      },
    },
  });

  const response = await app.request("/api/ui/inline/instant-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      executorType: "model",
      modelId: "model.quick",
      prompt: "Summarize this page",
      pageContext: "# Page",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.executorType, "model");
  assert.equal(body.modelId, "model.quick");
  assert.equal(body.text, "ok");
  assert.deepEqual(captured, {
    executorType: "model",
    prompt: "Summarize this page",
    system: "",
    pageContext: "# Page",
    modelId: "model.quick",
    agentId: "",
  });
});

test("instant route forwards acp executor payload to service", async () => {
  const app = new Hono();
  let captured = null;
  registerConsoleInlineInstantRoutes({
    app,
    async resolveAgentById(agentId) {
      return {
        id: agentId,
        name: "ACP Agent",
        projectRoot: agentId,
        running: false,
        startedAt: "",
        updatedAt: "",
      };
    },
    instantSessionService: {
      async run(input) {
        captured = input;
        return {
          sessionId: "inline:instant:acp:test",
          executorType: "acp",
          agentId: input.agentId,
          text: "done",
        };
      },
    },
  });

  const response = await app.request("/api/ui/inline/instant-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      executorType: "acp",
      agentId: "/tmp/acp-agent",
      prompt: "Explain this code",
      system: "be concise",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.executorType, "acp");
  assert.equal(body.agentId, "/tmp/acp-agent");
  assert.equal(body.text, "done");
  assert.deepEqual(captured, {
    executorType: "acp",
    prompt: "Explain this code",
    system: "be concise",
    pageContext: "",
    modelId: "",
    agentId: "/tmp/acp-agent",
  });
});

test("instant route rejects missing executor-specific ids", async () => {
  const app = new Hono();
  registerConsoleInlineInstantRoutes({
    app,
    async resolveAgentById() {
      return null;
    },
    instantSessionService: {
      async run() {
        throw new Error("should not be called");
      },
    },
  });

  const modelResponse = await app.request("/api/ui/inline/instant-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      executorType: "model",
      prompt: "hello",
    }),
  });
  assert.equal(modelResponse.status, 400);
  assert.match(await modelResponse.text(), /Missing modelId/u);

  const acpResponse = await app.request("/api/ui/inline/instant-run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      executorType: "acp",
      prompt: "hello",
    }),
  });
  assert.equal(acpResponse.status, 400);
  assert.match(await acpResponse.text(), /Missing agentId/u);
});
