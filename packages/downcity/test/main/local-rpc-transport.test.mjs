/**
 * 本地 IPC transport 测试。
 *
 * 关键点（中文）
 * - 本地受信任调用应通过 IPC，而不是 HTTP。
 * - 第一阶段先锁定 service list 这条最小可用链路。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import { startLocalRpcServer } from "../../bin/main/modules/rpc/Server.js";
import { callLocalServer } from "../../bin/main/modules/rpc/Client.js";
import {
  callAgentTransport,
  isAgentTransportUnavailableError,
  resolveAgentTransportErrorMessage,
} from "../../bin/main/modules/rpc/Transport.js";

function createAgentContext(rootPath) {
  return {
    rootPath,
    paths: {
      getDowncityChannelMetaPath() {
        return path.join(rootPath, ".downcity", "channel", "meta.json");
      },
    },
    plugins: {
      list() {
        return [
          {
            name: "test-plugin",
            title: "Test Plugin",
            description: "Test plugin for local rpc",
            actions: ["echo"],
            pipelines: [],
            guards: [],
            effects: [],
            resolves: [],
            hasSystem: false,
            hasAvailability: true,
          },
        ];
      },
      async availability(pluginName) {
        return {
          enabled: pluginName === "test-plugin",
          available: pluginName === "test-plugin",
          reasons: pluginName === "test-plugin" ? [] : ["unknown plugin"],
        };
      },
      async runAction({ plugin, action, payload }) {
        if (plugin !== "test-plugin" || action !== "echo") {
          return {
            success: false,
            error: "unknown plugin action",
          };
        }
        return {
          success: true,
          data: payload ?? null,
          message: "ok",
        };
      },
    },
  };
}

function createAgentRuntime(rootPath) {
  const session = {
    async appendUserMessage() {},
    async run({ query }) {
      return {
        success: true,
        assistantMessage: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `echo:${String(query || "").trim()}`,
            },
          ],
        },
      };
    },
    async appendAssistantMessage() {},
    clearExecutor() {},
  };
  return {
    rootPath,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    getSession() {
      return session;
    },
    listExecutingSessionIds() {
      return [];
    },
    getExecutingSessionCount() {
      return 0;
    },
    services: new Map(),
  };
}

async function startLocalRpcServerOrSkip(t, projectRoot, options = {}) {
  try {
    return await startLocalRpcServer({
      context: createAgentContext(projectRoot),
      ...options,
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
      t.skip("sandbox does not permit local unix socket listen");
      return null;
    }
    throw error;
  }
}

test("local rpc server should answer service list over IPC", async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-rpc-"));
  const server = await startLocalRpcServerOrSkip(t, projectRoot);
  if (!server) return;
  try {
    const result = await callLocalServer({
      projectRoot,
      path: "/api/services/list",
      method: "GET",
    });

    assert.equal(result.success, true);
    assert.equal(Array.isArray(result.data?.services), true);
  } finally {
    await server.stop();
    await fs.remove(projectRoot);
  }
});

test("local rpc server should return structured error for unknown route", async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-rpc-"));
  const server = await startLocalRpcServerOrSkip(t, projectRoot);
  if (!server) return;
  try {
    const result = await callLocalServer({
      projectRoot,
      path: "/api/unknown",
      method: "GET",
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 404);
    assert.match(String(result.error || ""), /unknown local rpc path/i);
  } finally {
    await server.stop();
    await fs.remove(projectRoot);
  }
});

test("callAgentTransport should use HTTP only when host or port is explicitly provided", async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-rpc-"));
  const originalFetch = globalThis.fetch;
  const seenUrls = [];
  globalThis.fetch = async (input) => {
    seenUrls.push(String(input));
    return Response.json({
      success: true,
      services: [],
    });
  };

  try {
    const result = await callAgentTransport({
      projectRoot,
      path: "/api/services/list",
      method: "GET",
      host: "127.0.0.1",
      port: 5314,
    });

    assert.equal(result.success, true);
    assert.equal(seenUrls.length, 1);
    assert.match(seenUrls[0], /http:\/\/127\.0\.0\.1:5314\/api\/services\/list/);
  } finally {
    globalThis.fetch = originalFetch;
    await fs.remove(projectRoot);
  }
});

test("transport unavailable helper should fold local IPC ENOENT into agent-unavailable state", () => {
  const error =
    "Local RPC unavailable at /tmp/downcity.sock: Error: connect ENOENT /tmp/downcity.sock";
  assert.equal(isAgentTransportUnavailableError(error), true);
  assert.equal(
    resolveAgentTransportErrorMessage({
      error,
      fallback: "Service action requires an active Agent server. Start via `city agent start` first.",
    }),
    "Service action requires an active Agent server. Start via `city agent start` first.",
  );
});

test("local rpc server should answer plugin list over IPC", async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-rpc-"));
  const server = await startLocalRpcServerOrSkip(t, projectRoot);
  if (!server) return;
  try {
    const result = await callLocalServer({
      projectRoot,
      path: "/api/plugins/list",
      method: "GET",
    });

    assert.equal(result.success, true);
    assert.equal(Array.isArray(result.data?.plugins), true);
    assert.equal(result.data?.plugins?.[0]?.name, "test-plugin");
  } finally {
    await server.stop();
    await fs.remove(projectRoot);
  }
});

test("local rpc server should answer plugin availability over IPC", async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-rpc-"));
  const server = await startLocalRpcServerOrSkip(t, projectRoot);
  if (!server) return;
  try {
    const result = await callLocalServer({
      projectRoot,
      path: "/api/plugins/availability",
      method: "POST",
      body: {
        pluginName: "test-plugin",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.pluginName, "test-plugin");
    assert.equal(result.data?.availability?.available, true);
  } finally {
    await server.stop();
    await fs.remove(projectRoot);
  }
});

test("local rpc server should answer plugin action over IPC", async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-rpc-"));
  const server = await startLocalRpcServerOrSkip(t, projectRoot);
  if (!server) return;
  try {
    const result = await callLocalServer({
      projectRoot,
      path: "/api/plugins/action",
      method: "POST",
      body: {
        pluginName: "test-plugin",
        actionName: "echo",
        payload: {
          value: 1,
        },
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.pluginName, "test-plugin");
    assert.equal(result.data?.actionName, "echo");
    assert.deepEqual(result.data?.data, { value: 1 });
  } finally {
    await server.stop();
    await fs.remove(projectRoot);
  }
});

test("local rpc server should execute dashboard session requests over IPC", async (t) => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "downcity-local-rpc-"));
  const server = await startLocalRpcServerOrSkip(t, projectRoot, {
    runtime: createAgentRuntime(projectRoot),
  });
  if (!server) return;
  try {
    const result = await callLocalServer({
      projectRoot,
      path: "/api/dashboard/sessions/consoleui-chat-main/execute",
      method: "POST",
      body: {
        instructions: "hello",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.data?.success, true);
    assert.equal(result.data?.sessionId, "consoleui-chat-main");
    assert.equal(result.data?.result?.queued, false);
  } finally {
    await server.stop();
    await fs.remove(projectRoot);
  }
});
