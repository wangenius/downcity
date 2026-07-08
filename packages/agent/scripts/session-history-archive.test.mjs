/**
 * @file 验证 session.records 的 compact archive 分层读取语义。
 *
 * 关键点（中文）
 * - compact summary 是模型上下文消息，但不应作为用户可见 history item 返回。
 * - 调用方通过 previous_archive_id 再传入 archive_id，读取上一层被覆盖历史。
 * - history 分页字段使用 snake_case，保持 SDK 对外数据命名一致。
 */

import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

import { Agent } from "../bin/index.js";

function user_message(session_id, index) {
  return {
    id: `u:${index}`,
    role: "user",
    metadata: {
      v: 1,
      ts: index,
      sessionId: session_id,
      source: "ingress",
    },
    parts: [{ type: "text", text: `user ${index}` }],
  };
}

function assistant_message(session_id, index) {
  return {
    id: `a:${index}`,
    role: "assistant",
    metadata: {
      v: 1,
      ts: index,
      sessionId: session_id,
      source: "egress",
    },
    parts: [{ type: "text", text: `assistant ${index}` }],
  };
}

function compact_summary(session_id, archive_id, text) {
  return {
    id: `summary:${archive_id}`,
    role: "assistant",
    metadata: {
      v: 1,
      ts: 1000,
      sessionId: session_id,
      source: "compact",
      kind: "summary",
      archiveId: archive_id,
      sourceRange: {
        fromId: "start",
        toId: "end",
        count: 2,
      },
    },
    parts: [{ type: "text", text }],
  };
}

async function write_jsonl(file_path, messages) {
  await fs.mkdir(path.dirname(file_path), { recursive: true });
  await fs.writeFile(
    file_path,
    messages.map((message) => JSON.stringify(message)).join("\n") + "\n",
    "utf8",
  );
}

async function write_archive(file_path, session_id, messages) {
  await fs.mkdir(path.dirname(file_path), { recursive: true });
  await fs.writeFile(
    file_path,
    JSON.stringify(
      {
        v: 1,
        sessionId: session_id,
        archivedAt: Date.now(),
        messages,
      },
      null,
      2,
    ),
    "utf8",
  );
}

test("session.records hides compact summary and reads archive layers by archive_id", async () => {
  const agent_path = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-agent-history-archive-"),
  );
  const agent = new Agent({
    id: "history_archive_agent",
    path: agent_path,
  });
  const session = await agent.sessions.create({
    sessionId: "history_archive_session",
  });

  const messages_dir = path.join(
    agent_path,
    ".downcity",
    "agents",
    encodeURIComponent("history_archive_agent"),
    "sessions",
    encodeURIComponent(session.id),
    "messages",
  );
  const messages_path = path.join(messages_dir, "messages.jsonl");
  const archive_dir = path.join(messages_dir, "archive");

  try {
    await write_jsonl(messages_path, [
      compact_summary(session.id, "compact-B", "summary B"),
      user_message(session.id, 31),
      assistant_message(session.id, 32),
    ]);
    await write_archive(path.join(archive_dir, "compact-B.json"), session.id, [
      compact_summary(session.id, "compact-A", "summary A"),
      user_message(session.id, 16),
      assistant_message(session.id, 17),
    ]);
    await write_archive(path.join(archive_dir, "compact-A.json"), session.id, [
      user_message(session.id, 1),
      assistant_message(session.id, 2),
    ]);

    const current_page = await session.records({
      limit: 1,
    });
    assert.equal(current_page.total, 2);
    assert.equal(current_page.has_more, true);
    assert.equal(current_page.next_cursor, "1");
    assert.equal(current_page.archive_id, undefined);
    assert.equal(current_page.previous_archive_id, "compact-B");
    assert.deepEqual(
      current_page.items.map((message) => message.id),
      ["u:31"],
    );

    const next_current_page = await session.records({
      cursor: current_page.next_cursor,
    });
    assert.equal(next_current_page.has_more, false);
    assert.deepEqual(
      next_current_page.items.map((message) => message.id),
      ["a:32"],
    );

    const previous_page = await session.records({
      archive_id: current_page.previous_archive_id,
    });
    assert.equal(previous_page.archive_id, "compact-B");
    assert.equal(previous_page.previous_archive_id, "compact-A");
    assert.equal(previous_page.total, 2);
    assert.deepEqual(
      previous_page.items.map((message) => message.id),
      ["u:16", "a:17"],
    );

    const oldest_page = await session.records({
      archive_id: previous_page.previous_archive_id,
    });
    assert.equal(oldest_page.archive_id, "compact-A");
    assert.equal(oldest_page.previous_archive_id, undefined);
    assert.deepEqual(
      oldest_page.items.map((message) => message.id),
      ["u:1", "a:2"],
    );

    const timeline_page = await session.records({
      view: "timeline",
      archive_id: "compact-B",
    });
    assert.deepEqual(
      timeline_page.items.map((event) => event.text),
      ["user 16", "assistant 17"],
    );
  } finally {
    await agent.dispose();
  }
});
