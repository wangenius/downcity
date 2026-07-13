/**
 * @file 验证独立 AgentHTTP 与 RemoteAgent 的核心 HTTP 契约。
 *
 * 关键点（中文）
 * - events 必须转发统一 SessionMutation，RemoteSession 的 turn.finished 才能结束。
 * - AgentHTTP 必须暴露 RemoteAgent 的 plugin action 路由，不能只提供 session 路由。
 */

import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { RemoteAgent } from "../../agent/bin/index.js";
import { AgentHTTP } from "../bin/index.js";

async function reserve_port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

function create_fake_agent() {
  const subscribers = new Set();
  const info = {
    agentId: "http-test-agent",
    sessionId: "http-test-session",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const session = {
    async get_info() {
      return info;
    },
    async prompt() {
      queueMicrotask(() => {
        for (const subscriber of subscribers) {
          subscriber({
            mutation_id: "turn-start-http-test",
            variant: "turn",
            type: "start",
            session_id: info.sessionId,
            turn_id: "turn-http-test",
            status: "running",
            created_at: Date.now(),
          });
          subscriber({
            variant: "delta",
            type: "text",
            mutation_id: "mutation-http-test",
            message_id: "message-http-test",
            revision: 1,
            session_id: info.sessionId,
            turn_id: "turn-http-test",
            created_at: Date.now(),
            part_id: "part-http-test",
            delta: "HTTP transport works",
          });
          subscriber({
            mutation_id: "approval-http-mutation",
            variant: "part",
            type: "tool",
            session_id: info.sessionId,
            turn_id: "turn-http-test",
            message_id: "message-http-test",
            revision: 2,
            created_at: Date.now(),
            part_id: "tool:call-http-test",
            part: {
              part_id: "tool:call-http-test",
              sequence: 2,
              type: "tool",
              tool_call_id: "call-http-test",
              tool_name: "shell_exec",
              state: "approval-required",
              approval_id: "approval-http-test",
              input: { cmd: "pwd" },
            },
          });
          subscriber({
            mutation_id: "turn-finish-http-test",
            variant: "turn",
            type: "finish",
            session_id: info.sessionId,
            turn_id: "turn-http-test",
            status: "completed",
            created_at: Date.now(),
            text: "HTTP transport works",
          });
        }
      });
      return { id: "turn-http-test" };
    },
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    async set() {},
    async stop() {
      return { stopped: false, cancelledQueuedPrompts: 0, reason: "idle" };
    },
    async messages() {
      return { items: [], total: 0, source: "active", has_more: false };
    },
    async system() {
      return { sessionId: info.sessionId, session: info, blocks: [] };
    },
    async approvals() {
      return [{
        approval_id: "approval-http-test",
        session_id: info.sessionId,
        tool_name: "shell_exec",
        command: "pwd",
        cwd: "/tmp",
        reason: "test",
        operation: "exec",
        created_at: Date.now(),
      }];
    },
    async approval_mode() {
      return { session_id: info.sessionId, mode: "ask" };
    },
    async set_approval_mode({ mode }) {
      return { session_id: info.sessionId, mode };
    },
    async resolve_approval({ approval_id, decision }) {
      return { success: true, approval_id, decision };
    },
    async fork() {
      return session;
    },
  };
  return {
    sessions: {
      async list() {
        return { items: [info], has_more: false };
      },
      async create() {
        return session;
      },
      async get() {
        return session;
      },
      async archive() {
        return { sessionId: info.sessionId, archivedAt: new Date().toISOString() };
      },
      async archived() {
        return { items: [], has_more: false };
      },
      async clean_archive() {
        return { removedSessionIds: [] };
      },
    },
    plugins: {
      async runAction({ plugin, action, payload }) {
        return { success: true, data: { plugin, action, payload } };
      },
    },
  };
}

test("AgentHTTP resolves RemoteAgent turns and exposes plugin actions", async () => {
  const port = await reserve_port();
  const http = new AgentHTTP(create_fake_agent());
  const remote_agent = new RemoteAgent({ url: `http://127.0.0.1:${port}` });
  try {
    await http.server().listen({ host: "127.0.0.1", port });
    const session = await remote_agent.sessions.create();
    const mutations = [];
    let approval_reply;
    const unsubscribe = session.subscribe((mutation, reply) => {
      mutations.push(mutation);
      if (mutation.variant === "part" && mutation.type === "tool") {
        approval_reply = reply.approval({ decision: "approved" });
      }
    });
    const turn = await session.prompt({ query: "test" });
    const result = await turn.finished;
    unsubscribe();

    assert.equal(result.success, true);
    assert.equal(result.text, "HTTP transport works");
    assert.deepEqual(mutations.map((mutation) => mutation.variant), ["turn", "delta", "part", "turn"]);
    assert.equal(mutations[1].delta, "HTTP transport works");
    assert.deepEqual(await approval_reply, {
      success: true,
      approval_id: "approval-http-test",
      decision: "approved",
    });

    assert.equal((await session.approvals())[0].approval_id, "approval-http-test");
    assert.equal((await session.set_approval_mode({ mode: "always-allow" })).mode, "always-allow");
    assert.deepEqual(
      await session.resolve_approval({
        approval_id: "approval-http-test",
        decision: "approved",
      }),
      { success: true, approval_id: "approval-http-test", decision: "approved" },
    );

    const action = await remote_agent.runPluginAction({
      plugin: "demo",
      action: "echo",
      payload: { text: "hello" },
    });
    assert.deepEqual(action, {
      success: true,
      data: {
        plugin: "demo",
        action: "echo",
        payload: { text: "hello" },
      },
      pluginName: "demo",
      actionName: "echo",
    });
  } finally {
    await remote_agent.close();
    await http.close();
  }
});
