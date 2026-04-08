/**
 * Console 模型路由测试（node:test）。
 *
 * 关键点（中文）
 * - `/api/ui/model/infer` 应支持直接走模型池推理，不依赖 agent/session。
 * - 路由层只负责校验输入并把结构化字段透传给模型服务。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { registerConsoleModelRoutes } from "../../bin/main/modules/console/ModelApiRoutes.js";

test("model infer route forwards structured request to model service", async () => {
  const app = new Hono();
  const calls = [];
  const modelPoolService = {
    async inferWithModel(input) {
      calls.push(input);
      return {
        modelId: String(input.modelId || ""),
        prompt: String(input.prompt || ""),
        text: "stub inference response",
      };
    },
  };

  registerConsoleModelRoutes({
    app,
    readRequestedAgentId() {
      return "";
    },
    async resolveSelectedAgent() {
      return null;
    },
    async buildModelResponse() {
      return {
        success: true,
        model: {
          primaryModelId: "",
          primaryModelName: "",
          providerKey: "",
          providerType: "",
          baseUrl: "",
          agentPrimaryModelId: "",
          availableModels: [],
        },
      };
    },
    modelPoolService,
  });

  const response = await app.request("/api/ui/model/infer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      modelId: "model.quick",
      prompt: "请用三句话总结这个页面",
      system: "你是一个网页阅读助手",
      pageContext: "# 页面标题\n\n这是页面正文",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.modelId, "model.quick");
  assert.equal(body.text, "stub inference response");
  assert.deepEqual(calls, [
    {
      modelId: "model.quick",
      prompt: "请用三句话总结这个页面",
      system: "你是一个网页阅读助手",
      pageContext: "# 页面标题\n\n这是页面正文",
    },
  ]);
});

test("model infer route rejects empty modelId", async () => {
  const app = new Hono();

  registerConsoleModelRoutes({
    app,
    readRequestedAgentId() {
      return "";
    },
    async resolveSelectedAgent() {
      return null;
    },
    async buildModelResponse() {
      return {
        success: true,
        model: {
          primaryModelId: "",
          primaryModelName: "",
          providerKey: "",
          providerType: "",
          baseUrl: "",
          agentPrimaryModelId: "",
          availableModels: [],
        },
      };
    },
    modelPoolService: {
      async inferWithModel() {
        throw new Error("should not be called");
      },
    },
  });

  const response = await app.request("/api/ui/model/infer", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      prompt: "hello",
    }),
  });

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Missing modelId");
});
