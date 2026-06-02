/**
 * @file 验证 Session 标题会进入 subscribe 事件与 history session 信息。
 *
 * 关键点（中文）
 * - 这里走编译后的公开 SDK，锁住调用方实际可见行为。
 * - 使用 appendUserMessage 触发 fallback 标题，避免测试依赖真实模型。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { Agent } from "../bin/index.js";

test("Session publishes title event and exposes title in history", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-session-title-"),
  );
  const agent = new Agent({
    id: "title_agent",
    path: agent_path,
  });
  const session = await agent.createSession();
  const events = [];
  const unsubscribe = session.subscribe((event) => {
    events.push(event);
  });

  try {
    await session.appendUserMessage({
      text: "Use shell tools to inspect the current workspace",
    });

    const title_event = events.find((event) => event.type === "session-title");
    assert.deepEqual(title_event, {
      type: "session-title",
      sessionId: session.id,
      title: "Use shell tools to inspect the current workspace",
    });

    const history = await session.history();
    assert.equal(
      history.session.title,
      "Use shell tools to inspect the current workspace",
    );
  } finally {
    unsubscribe();
  }
});
