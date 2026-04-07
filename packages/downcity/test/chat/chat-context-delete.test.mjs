/**
 * Chat session 彻底删除测试（node:test）。
 *
 * 关键点（中文）
 * - 删除应同时清理：路由映射、chat 审计目录、core session 目录。
 * - 删除后再次读取 chat meta 应为空，避免残留可路由状态。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import {
  getDowncityChatSessionDirPath,
  getDowncitySessionDirPath,
} from "../../bin/main/city/env/Paths.js";
import { deleteChatSessionById } from "../../bin/services/chat/runtime/ChatSessionDelete.js";
import {
  readChatMetaBySessionId,
  resolveOrCreateSessionIdByChatTarget,
} from "../../bin/services/chat/runtime/ChatMetaStore.js";

function createRuntime(rootPath) {
  const cleared = [];
  const runtime = {
    rootPath,
    paths: {
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity/channel"),
      getDowncityChannelMetaPath: () =>
        path.join(rootPath, ".downcity/channel/meta.json"),
      getCacheDirPath: () => path.join(rootPath, ".downcity/.cache"),
      getDowncitySessionDirPath: (sessionId) =>
        path.join(rootPath, ".downcity/session", sessionId),
    },
    session: {
      get(sessionId) {
        return {
          sessionId,
          clearExecutor() {
            cleared.push(String(sessionId || ""));
          },
        };
      },
    },
  };
  return { runtime, cleared };
}

test("deleteChatSessionById removes route and storage directories", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "chat-delete-"));
  const { runtime, cleared } = createRuntime(rootPath);

  try {
    const sessionId = await resolveOrCreateSessionIdByChatTarget({
      context: runtime,
      channel: "qq",
      chatId: "group-1001",
      targetType: "group",
    });
    assert.ok(sessionId);

    const chatDir = getDowncityChatSessionDirPath(rootPath, sessionId);
    const sessionDir = getDowncitySessionDirPath(rootPath, sessionId);
    await fs.ensureDir(chatDir);
    await fs.ensureDir(sessionDir);
    await fs.writeFile(path.join(chatDir, "history.jsonl"), "{}", "utf-8");
    await fs.writeFile(path.join(sessionDir, "dummy.txt"), "x", "utf-8");

    const result = await deleteChatSessionById({
      context: runtime,
      sessionId,
    });
    assert.equal(result.success, true);
    assert.equal(result.sessionId, sessionId);
    assert.equal(result.deleted, true);
    assert.equal(result.removedMeta, true);
    assert.equal(result.removedChatDir, true);
    assert.equal(result.removedSessionDir, true);

    const remainingMeta = await readChatMetaBySessionId({
      context: runtime,
      sessionId,
    });
    assert.equal(remainingMeta, null);
    assert.equal(await fs.pathExists(chatDir), false);
    assert.equal(await fs.pathExists(sessionDir), false);
    assert.deepEqual(cleared, [sessionId]);
  } finally {
    await fs.remove(rootPath);
  }
});

test("deleteChatSessionById is idempotent for missing session", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "chat-delete-"));
  const { runtime, cleared } = createRuntime(rootPath);
  try {
    const result = await deleteChatSessionById({
      context: runtime,
      sessionId: "ctx_missing_001",
    });
    assert.equal(result.success, true);
    assert.equal(result.deleted, false);
    assert.equal(result.removedMeta, false);
    assert.equal(result.removedChatDir, false);
    assert.equal(result.removedSessionDir, false);
    assert.deepEqual(cleared, ["ctx_missing_001"]);
  } finally {
    await fs.remove(rootPath);
  }
});
