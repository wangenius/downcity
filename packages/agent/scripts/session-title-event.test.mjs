/**
 * @file 验证 Session 标题会进入 subscribe 事件与 history session 信息。
 *
 * 关键点（中文）
 * - 这里走编译后的公开 SDK，锁住调用方实际可见行为。
 * - title 默认允许为空；没有可用模型时不会再回退成首条 user message。
 * - 当后续补上模型且 title 仍为空时，应允许再次尝试生成。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { MockLanguageModelV3 } from "ai/test";
import { Agent } from "../bin/index.js";

function create_mock_title_model(title_text) {
  return new MockLanguageModelV3({
    modelId: "mock-session-title-model",
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: title_text,
        },
      ],
      finishReason: "stop",
      usage: {
        inputTokens: {
          total: 0,
          noCache: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: {
          total: 0,
          text: 0,
          reasoning: 0,
        },
      },
      warnings: [],
    }),
  });
}

test("Session keeps title empty when no model is available", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-session-title-"),
  );
  const agent = new Agent({
    id: "title_agent",
    path: agent_path,
  });
  const session = await agent.sessions.create();
  const events = [];
  const unsubscribe = session.subscribe((event) => {
    events.push(event);
  });

  try {
    await session.append_user_message({
      text: "Use shell tools to inspect the current workspace",
    });

    const title_event = events.find((event) => event.type === "session-title");
    assert.equal(title_event, undefined);

    const records = await session.records();
    assert.equal(records.session.title, undefined);
  } finally {
    unsubscribe();
    await agent.dispose();
  }
});

test("Session retries title generation after model becomes available", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-session-title-retry-"),
  );
  const agent = new Agent({
    id: "title_retry_agent",
    path: agent_path,
  });
  const session = await agent.sessions.create();
  const events = [];
  const unsubscribe = session.subscribe((event) => {
    events.push(event);
  });

  try {
    await session.append_user_message({
      text: "Investigate flaky session title generation in the SDK",
    });

    const history_before_model = await session.records();
    assert.equal(history_before_model.session.title, undefined);

    await session.set({
      model: create_mock_title_model("排查 session 标题"),
    });
    await session.append_user_message({
      text: "Need another prompt to trigger the retry path",
    });

    const title_event = events.find((event) => event.type === "session-title");
    assert.deepEqual(title_event, {
      type: "session-title",
      sessionId: session.id,
      title: "排查 session 标题",
    });

    const records = await session.records();
    assert.equal(records.session.title, "排查 session 标题");
  } finally {
    unsubscribe();
    await agent.dispose();
  }
});
