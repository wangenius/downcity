/**
 * Console UI 路由注册测试（node:test）。
 *
 * 关键点（中文）
 * - `/api/ui/agents/create` 必须先初始化项目，再按 `autoStart` 决定是否启动。
 * - 当 `autoStart === false` 时，不应偷偷进入启动分支。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Hono } from "hono";
import { registerConsoleGatewayRoutes } from "../../bin/main/modules/console/ConsoleGatewayRoutes.js";

function buildHandlers(overrides = {}) {
  return {
    readRequestedAgentId() {
      return "";
    },
    async buildAgentsResponse() {
      return { success: true, cityVersion: "test", agents: [], selectedAgentId: "" };
    },
    async initializeAgentProject(projectRoot, initialization) {
      return {
        projectRoot,
        agentName: String(initialization?.agentName || "Test Agent"),
        executionMode: String(initialization?.executionMode || "api"),
        modelId: String(initialization?.modelId || "model.test"),
        channels: [],
        createdFiles: ["PROFILE.md", "downcity.json"],
        skippedFiles: [],
      };
    },
    async updateAgentExecution(projectRoot, input) {
      return {
        projectRoot,
        executionMode: String(input?.executionMode || "api"),
        modelId: String(input?.modelId || "model.test"),
      };
    },
    async startAgentByProjectRoot(projectRoot) {
      return {
        success: true,
        projectRoot,
        started: true,
        message: "started",
      };
    },
    async pickDirectoryPath() {
      return "/tmp";
    },
    async inspectAgentDirectory() {
      return { exists: true, initialized: true, profileExists: true, shipExists: true };
    },
    async listLocalModels() {
      return {
        success: true,
        modelsDir: "/Users/test/.models",
        models: ["gemma.gguf"],
      };
    },
    async inspectAgentRestartSafety() {
      return { activeContexts: [], activeTasks: [] };
    },
    async restartAgentByProjectRoot(projectRoot) {
      return { success: true, projectRoot, restarted: true, message: "restarted" };
    },
    async stopAgentByProjectRoot(projectRoot) {
      return { success: true, projectRoot, stopped: true, message: "stopped" };
    },
    async buildConfigStatusResponse() {
      return { success: true, cityVersion: "test", selectedAgentId: "", files: [] };
    },
    async resolveAgentById() {
      return null;
    },
    async executeShellCommand() {
      return {
        command: "",
        cwd: "",
        exitCode: 0,
        signal: "",
        timedOut: false,
        durationMs: 0,
        stdout: "",
        stderr: "",
      };
    },
    async buildModelResponse() {
      return {
        success: true,
        model: {
          primaryModelId: "model.test",
          primaryModelName: "Test",
          providerKey: "provider",
          providerType: "openai",
          baseUrl: "",
          agentPrimaryModelId: "model.test",
          availableModels: [],
        },
      };
    },
    async resolveSelectedAgent() {
      return null;
    },
    buildUpstreamUrl() {
      return "http://127.0.0.1";
    },
    async forwardRequest() {
      return new Response("ok");
    },
    async serveFrontendPath() {
      return new Response("index");
    },
    ...overrides,
  };
}

test("create route initializes without starting when autoStart is false", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleGatewayRoutes({
    app,
    handlers: buildHandlers({
      async initializeAgentProject(projectRoot, initialization) {
        calls.push({ type: "initialize", projectRoot, initialization });
        return {
          projectRoot,
          agentName: "Alpha",
          executionMode: "api",
          modelId: "model.alpha",
          channels: [],
          createdFiles: ["PROFILE.md", "downcity.json"],
          skippedFiles: [],
        };
      },
      async startAgentByProjectRoot(projectRoot) {
        calls.push({ type: "start", projectRoot });
        return {
          success: true,
          projectRoot,
          started: true,
          message: "started",
        };
      },
    }),
  });

  const response = await app.request("/api/ui/agents/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectRoot: "/tmp/agent-alpha",
      agentName: "Alpha",
      executionMode: "api",
      modelId: "model.alpha",
      autoStart: false,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.created, true);
  assert.equal(body.started, false);
  assert.equal(body.agentName, "Alpha");
  assert.deepEqual(calls, [
    {
      type: "initialize",
      projectRoot: "/tmp/agent-alpha",
        initialization: {
          agentName: "Alpha",
          executionMode: "api",
          modelId: "model.alpha",
          localModel: undefined,
          agentType: undefined,
          forceOverwriteShipJson: undefined,
        },
    },
  ]);
});

test("create route starts agent after initialization when autoStart is enabled", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleGatewayRoutes({
    app,
    handlers: buildHandlers({
      async initializeAgentProject(projectRoot) {
        calls.push({ type: "initialize", projectRoot });
        return {
          projectRoot,
          agentName: "Beta",
          executionMode: "api",
          modelId: "model.beta",
          channels: [],
          createdFiles: ["PROFILE.md", "downcity.json"],
          skippedFiles: [],
        };
      },
      async startAgentByProjectRoot(projectRoot) {
        calls.push({ type: "start", projectRoot });
        return {
          success: true,
          projectRoot,
          started: true,
          pid: 42,
          message: "started",
        };
      },
    }),
  });

  const response = await app.request("/api/ui/agents/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectRoot: "/tmp/agent-beta",
      agentName: "Beta",
      executionMode: "api",
      modelId: "model.beta",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.started, true);
  assert.deepEqual(calls, [
    { type: "initialize", projectRoot: "/tmp/agent-beta" },
    { type: "start", projectRoot: "/tmp/agent-beta" },
  ]);
});

test("create route forwards ACP agentType during initialization", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleGatewayRoutes({
    app,
    handlers: buildHandlers({
      async initializeAgentProject(projectRoot, initialization) {
        calls.push({ type: "initialize", projectRoot, initialization });
        return {
          projectRoot,
          agentName: "Kimi Agent",
        executionMode: "acp",
        agentType: "kimi",
          channels: [],
          createdFiles: ["PROFILE.md", "downcity.json"],
          skippedFiles: [],
        };
      },
    }),
  });

  const response = await app.request("/api/ui/agents/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectRoot: "/tmp/agent-kimi",
      agentName: "Kimi Agent",
      executionMode: "acp",
      agentType: "kimi",
      autoStart: false,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.started, false);
  assert.deepEqual(calls, [
    {
      type: "initialize",
      projectRoot: "/tmp/agent-kimi",
      initialization: {
        agentName: "Kimi Agent",
        executionMode: "acp",
        modelId: undefined,
        localModel: undefined,
        agentType: "kimi",
        forceOverwriteShipJson: undefined,
      },
    },
  ]);
});

test("execution route forwards unified execution payload", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleGatewayRoutes({
    app,
    handlers: buildHandlers({
      async updateAgentExecution(projectRoot, input) {
        calls.push({ projectRoot, input });
        return {
          projectRoot,
          executionMode: "acp",
          agentType: "codex",
        };
      },
    }),
  });

  const response = await app.request("/api/ui/agents/execution", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectRoot: "/tmp/agent-gamma",
      executionMode: "acp",
      agentType: "codex",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.executionMode, "acp");
  assert.equal(body.agentType, "codex");
  assert.equal(body.restartRequired, true);
  assert.deepEqual(calls, [
    {
      projectRoot: "/tmp/agent-gamma",
      input: {
        executionMode: "acp",
        modelId: undefined,
        localModel: undefined,
        agentType: "codex",
      },
    },
  ]);
});

test("create route forwards localModel during initialization", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleGatewayRoutes({
    app,
    handlers: buildHandlers({
      async initializeAgentProject(projectRoot, initialization) {
        calls.push({ type: "initialize", projectRoot, initialization });
        return {
          projectRoot,
          agentName: "Local Agent",
          executionMode: "local",
          channels: [],
          createdFiles: ["PROFILE.md", "downcity.json"],
          skippedFiles: [],
        };
      },
    }),
  });

  const response = await app.request("/api/ui/agents/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectRoot: "/tmp/agent-local",
      agentName: "Local Agent",
      executionMode: "local",
      localModel: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
      autoStart: false,
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.started, false);
  assert.deepEqual(calls, [
    {
      type: "initialize",
      projectRoot: "/tmp/agent-local",
      initialization: {
        agentName: "Local Agent",
        executionMode: "local",
        modelId: undefined,
        localModel: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
        agentType: undefined,
        forceOverwriteShipJson: undefined,
      },
    },
  ]);
});

test("execution route forwards localModel for local runtime", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleGatewayRoutes({
    app,
    handlers: buildHandlers({
      async updateAgentExecution(projectRoot, input) {
        calls.push({ projectRoot, input });
        return {
          projectRoot,
          executionMode: "local",
        };
      },
    }),
  });

  const response = await app.request("/api/ui/agents/execution", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectRoot: "/tmp/agent-local",
      executionMode: "local",
      localModel: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.executionMode, "local");
  assert.equal(body.restartRequired, true);
  assert.deepEqual(calls, [
    {
      projectRoot: "/tmp/agent-local",
      input: {
        executionMode: "local",
        modelId: undefined,
        localModel: "gemma-4-E4B-it-UD-Q4_K_XL.gguf",
        agentType: undefined,
      },
    },
  ]);
});

test("local-models route returns available gguf list", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleGatewayRoutes({
    app,
    handlers: buildHandlers({
      async listLocalModels(projectRoot) {
        calls.push(projectRoot);
        return {
          success: true,
          modelsDir: "/Users/test/.models",
          models: ["gemma-4-E4B-it-UD-Q4_K_XL.gguf", "qwen.gguf"],
        };
      },
    }),
  });

  const response = await app.request("/api/ui/local-models", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      projectRoot: "/tmp/agent-local",
    }),
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.modelsDir, "/Users/test/.models");
  assert.deepEqual(body.models, ["gemma-4-E4B-it-UD-Q4_K_XL.gguf", "qwen.gguf"]);
  assert.deepEqual(calls, ["/tmp/agent-local"]);
});
