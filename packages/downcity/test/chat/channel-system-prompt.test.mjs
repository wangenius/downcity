/**
 * Chat system prompt channel 作用域测试（node:test）。
 *
 * 关键点（中文）
 * - 当前请求若已绑定 chat channel，只应注入当前 channel 的 prompt。
 * - 非 chat context（如 consoleui）不应把所有已启用 channel prompt 一起注入。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { withRequestContext } from "../../bin/agent/context/manager/RequestContext.js";
import { chatService } from "../../bin/services/chat/Index.js";
import { upsertChatMetaByContextId } from "../../bin/services/chat/runtime/ChatMetaStore.js";

function createRuntime(rootPath) {
  return {
    rootPath,
    config: {
      services: {
        chat: {
          method: "direct",
          channels: {
            telegram: { enabled: true },
            feishu: { enabled: true },
            qq: { enabled: true },
          },
        },
      },
    },
  };
}

test("chat service system injects only the current channel prompt", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "chat-system-prompt-"));
  const runtime = createRuntime(rootPath);

  try {
    await upsertChatMetaByContextId({
      context: runtime,
      contextId: "ctx_feishu_only",
      channel: "feishu",
      chatId: "oc_123",
    });

    const prompt = await withRequestContext(
      {
        contextId: "ctx_feishu_only",
        requestId: "req_feishu_only",
      },
      () => chatService.system(runtime),
    );

    assert.equal(prompt.includes("当前模式下，直接输出，即会发送消息给到用户对应的channel"), true);
    assert.equal(prompt.includes("# Feishu Channel"), true);
    assert.equal(prompt.includes("# QQ Adapter 使用说明（direct 模式）"), false);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});

test("chat service system skips channel prompts when current context is not a chat channel", async () => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "chat-system-prompt-"));
  const runtime = createRuntime(rootPath);

  try {
    const prompt = await withRequestContext(
      {
        contextId: "consoleui-chat-main",
        requestId: "req_consoleui_only",
      },
      () => chatService.system(runtime),
    );

    assert.equal(prompt.includes("当前模式下，直接输出，即会发送消息给到用户对应的channel"), true);
    assert.equal(prompt.includes("# Feishu Channel"), false);
    assert.equal(prompt.includes("# QQ Adapter 使用说明（direct 模式）"), false);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
