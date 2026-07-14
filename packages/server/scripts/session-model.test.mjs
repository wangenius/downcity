/**
 * @file 验证 RemoteAgent 通过 RPC 控制 Session。
 *
 * 关键点（中文）
 * - 远程只传稳定 modelId，运行时模型由 Agent 宿主 resolver 创建。
 * - 切换结果立即反映在同一个 Session，不重启 AgentRPC。
 * - compact 只验证 command 被远程 Session 接受，不应自行启动 turn。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Agent, RemoteAgent } from "../../agent/bin/index.js";
import { AgentRPC } from "../bin/index.js";

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

test("RPC updates model and queues compact without restarting Agent", async () => {
  const project_root = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-server-session-model-"),
  );
  const resolve_model = async (model_id) => ({
    modelId: model_id,
    provider: "test",
  });
  const agent = new Agent({
    id: "rpc_model_agent",
    path: project_root,
    model: await resolve_model("default-model"),
    model_id: "default-model",
    resolve_model,
  });
  const rpc = new AgentRPC(agent);
  const port = await reserve_port();
  const remote_agent = new RemoteAgent({
    url: `rpc://127.0.0.1:${port}`,
  });
  try {
    await agent.ready();
    await rpc.listen({ host: "127.0.0.1", port });
    const session = await remote_agent.sessions.create({
      sessionId: "rpc-model-session",
    });
    assert.equal((await session.get_info()).modelId, "default-model");

    await session.set({ modelId: "session-model" });

    assert.equal((await session.get_info()).modelId, "session-model");
    assert.equal(session.config.modelId, "session-model");

    await session.compact();
  } finally {
    await remote_agent.close();
    await rpc.close();
    await agent.dispose();
    await fs.rm(project_root, { recursive: true, force: true });
  }
});
