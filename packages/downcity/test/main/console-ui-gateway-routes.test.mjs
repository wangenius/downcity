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
import { registerConsoleUiGatewayRoutes } from "../../bin/main/ui/ConsoleUIGatewayRoutes.js";

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
        primaryModelId: String(initialization?.primaryModelId || "model.test"),
        channels: [],
        createdFiles: ["PROFILE.md", "downcity.json"],
        skippedFiles: [],
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
  registerConsoleUiGatewayRoutes({
    app,
    handlers: buildHandlers({
      async initializeAgentProject(projectRoot, initialization) {
        calls.push({ type: "initialize", projectRoot, initialization });
        return {
          projectRoot,
          agentName: "Alpha",
          primaryModelId: "model.alpha",
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
      primaryModelId: "model.alpha",
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
        primaryModelId: "model.alpha",
        forceOverwriteShipJson: undefined,
      },
    },
  ]);
});

test("create route starts agent after initialization when autoStart is enabled", async () => {
  const app = new Hono();
  const calls = [];
  registerConsoleUiGatewayRoutes({
    app,
    handlers: buildHandlers({
      async initializeAgentProject(projectRoot) {
        calls.push({ type: "initialize", projectRoot });
        return {
          projectRoot,
          agentName: "Beta",
          primaryModelId: "model.beta",
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
      primaryModelId: "model.beta",
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
