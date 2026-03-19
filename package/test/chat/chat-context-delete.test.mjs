/**
 * Chat context 彻底删除测试（node:test）。
 *
 * 关键点（中文）
 * - 删除应同时清理：路由映射、chat 审计目录、core context 目录。
 * - 删除后再次读取 chat meta 应为空，避免残留可路由状态。
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import fs from "fs-extra";
import {
  getShipChatContextDirPath,
  getShipContextDirPath,
} from "../../bin/console/env/Paths.js";
import { deleteChatContextById } from "../../bin/services/chat/runtime/ChatContextDelete.js";
import {
  readChatMetaByContextId,
  resolveOrCreateContextIdByChatTarget,
} from "../../bin/services/chat/runtime/ChatMetaStore.js";

function createRuntime(rootPath) {
  const cleared = [];
  const runtime = {
    rootPath,
    context: {
      clearAgent(contextId) {
        cleared.push(String(contextId || ""));
      },
    },
  };
  return { runtime, cleared };
}

test("deleteChatContextById removes route and storage directories", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "chat-delete-"));
  const { runtime, cleared } = createRuntime(rootPath);

  try {
    const contextId = await resolveOrCreateContextIdByChatTarget({
      context: runtime,
      channel: "qq",
      chatId: "group-1001",
      targetType: "group",
    });
    assert.ok(contextId);

    const chatDir = getShipChatContextDirPath(rootPath, contextId);
    const contextDir = getShipContextDirPath(rootPath, contextId);
    await fs.ensureDir(chatDir);
    await fs.ensureDir(contextDir);
    await fs.writeFile(path.join(chatDir, "history.jsonl"), "{}", "utf-8");
    await fs.writeFile(path.join(contextDir, "dummy.txt"), "x", "utf-8");

    const result = await deleteChatContextById({
      context: runtime,
      contextId,
    });
    assert.equal(result.success, true);
    assert.equal(result.contextId, contextId);
    assert.equal(result.deleted, true);
    assert.equal(result.removedMeta, true);
    assert.equal(result.removedChatDir, true);
    assert.equal(result.removedContextDir, true);

    const remainingMeta = await readChatMetaByContextId({
      context: runtime,
      contextId,
    });
    assert.equal(remainingMeta, null);
    assert.equal(await fs.pathExists(chatDir), false);
    assert.equal(await fs.pathExists(contextDir), false);
    assert.deepEqual(cleared, [contextId]);
  } finally {
    await fs.remove(rootPath);
  }
});

test("deleteChatContextById is idempotent for missing context", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "chat-delete-"));
  const { runtime, cleared } = createRuntime(rootPath);
  try {
    const result = await deleteChatContextById({
      context: runtime,
      contextId: "ctx_missing_001",
    });
    assert.equal(result.success, true);
    assert.equal(result.deleted, false);
    assert.equal(result.removedMeta, false);
    assert.equal(result.removedChatDir, false);
    assert.equal(result.removedContextDir, false);
    assert.deepEqual(cleared, ["ctx_missing_001"]);
  } finally {
    await fs.remove(rootPath);
  }
});
