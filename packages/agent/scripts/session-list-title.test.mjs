/**
 * @file 验证 session 列表从正确目录读取持久化 title。
 *
 * 关键点（中文）
 * - 普通列表只读取 `.downcity/agents/<agentId>/sessions` 下的 meta。
 * - 归档列表只读取 `.downcity/agents/<agentId>/archived-sessions` 下的 meta。
 * - title 允许为空；这里仅验证已由模型生成并落盘的 title 能被列表返回。
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
    modelId: "mock-session-list-title-model",
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          controller.enqueue({ type: "text-start", id: "title" });
          controller.enqueue({
            type: "text-delta",
            id: "title",
            delta: title_text,
          });
          controller.enqueue({ type: "text-end", id: "title" });
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
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
          });
          controller.close();
        },
      }),
    }),
  });
}

async function create_agent_with_titled_session(input) {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), input.tmp_prefix),
  );
  const agent = new Agent({
    id: input.agent_id,
    path: agent_path,
    model: create_mock_title_model(input.title),
  });
  const collection = agent.sessions;
  const session = await collection.create({
    sessionId: input.session_id,
  });

  await session.append_user_message({
    text: input.first_user_text,
  });

  return {
    agent,
    collection,
    session,
  };
}

test("list_sessions returns persisted title from active session metadata", async () => {
  const { agent, collection, session } = await create_agent_with_titled_session({
    tmp_prefix: "downcity-agent-session-list-title-",
    agent_id: "list_title_agent",
    session_id: "active_session",
    title: "列表标题",
    first_user_text: "Need the session list to show the generated title",
  });

  try {
    const page = await collection.list();
    const meta = JSON.parse(
      await fs.readFile(
        path.join(
          agent.path,
          ".downcity",
          "agents",
          encodeURIComponent(agent.id),
          "sessions",
          encodeURIComponent(session.id),
          "messages",
          "meta.json",
        ),
        "utf8",
      ),
    );

    assert.equal(page.total, 1);
    assert.equal(meta.messageCount, 1);
    assert.equal(meta.previewText, "Need the session list to show the generated title");
    const history_stat = await fs.stat(
      path.join(
        agent.path,
        ".downcity",
        "agents",
        encodeURIComponent(agent.id),
        "sessions",
        encodeURIComponent(session.id),
        "messages",
        "messages.jsonl",
      ),
    );
    assert.equal(meta.historyBytes, history_stat.size);
    assert.deepEqual(
      page.items.map((item) => ({
        sessionId: item.sessionId,
        title: item.title,
        messageCount: item.messageCount,
      })),
      [
        {
          sessionId: session.id,
          title: "列表标题",
          messageCount: 1,
        },
      ],
    );
  } finally {
    await agent.dispose();
  }
});

test("list_sessions reflects canonical Recorder history changes", async () => {
  const { agent, collection, session } = await create_agent_with_titled_session({
    tmp_prefix: "downcity-agent-session-summary-repair-",
    agent_id: "summary_repair_agent",
    session_id: "summary_repair_session",
    title: "摘要修复",
    first_user_text: "Initial history",
  });
  const messages_dir = path.join(
    agent.path,
    ".downcity",
    "agents",
    encodeURIComponent(agent.id),
    "sessions",
    encodeURIComponent(session.id),
    "messages",
  );
  const messages_path = path.join(messages_dir, "messages.jsonl");
  const meta_path = path.join(messages_dir, "meta.json");

  try {
    await session.append_assistant_message({
      text: "Recorder appended history",
    });

    const page = await collection.list();
    const repaired_meta = JSON.parse(await fs.readFile(meta_path, "utf8"));
    const history_stat = await fs.stat(messages_path);

    assert.equal(page.items[0].messageCount, 2);
    assert.equal(page.items[0].previewText, "Recorder appended history");
    assert.equal(repaired_meta.messageCount, 2);
    assert.equal(repaired_meta.previewText, "Recorder appended history");
    assert.equal(repaired_meta.historyBytes, history_stat.size);
  } finally {
    await agent.dispose();
  }
});

test("archive_sessions returns title from archived session metadata", async () => {
  const { agent, collection, session } = await create_agent_with_titled_session({
    tmp_prefix: "downcity-agent-archive-list-title-",
    agent_id: "archive_list_title_agent",
    session_id: "archived_session",
    title: "归档标题",
    first_user_text: "Archive this titled session",
  });

  try {
    await collection.archive({
      id: session.id,
    });

    const active_page = await collection.list();
    const archived_page = await collection.archived();

    assert.equal(active_page.total, 0);
    assert.equal(archived_page.total, 1);
    assert.deepEqual(
      archived_page.items.map((item) => ({
        sessionId: item.sessionId,
        title: item.title,
        messageCount: item.messageCount,
      })),
      [
        {
          sessionId: session.id,
          title: "归档标题",
          messageCount: 1,
        },
      ],
    );
  } finally {
    await agent.dispose();
  }
});
