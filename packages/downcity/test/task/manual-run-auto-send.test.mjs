/**
 * Task 手动执行自动回发测试（node:test）。
 *
 * 关键点（中文）
 * - `task.run` 异步受理后，后台执行完成必须通过 chat service `send` action 回发结果。
 * - 回发正文应直接使用 task 最终结果本身，避免再包一层摘要外壳。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTaskDefinition,
  runTaskDefinition,
} from "../../bin/services/task/Action.js";
import { ChatService } from "../../bin/services/chat/ChatService.js";
import { upsertChatMetaBySessionId } from "../../bin/services/chat/runtime/ChatMetaStore.js";
import {
  getChatSender,
  registerChatSender,
  unregisterChatSender,
} from "../../bin/services/chat/runtime/ChatSendRegistry.js";

const TELEGRAM_CHANNEL = "telegram";
const SESSION_ID = "ctx_task_manual_auto_send";

function createRuntime(rootPath) {
  return {
    cwd: rootPath,
    rootPath,
    env: {},
    config: {},
    systems: [],
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
      log() {},
    },
    invoke: {
      async invoke() {
        throw new Error("invoke mock not configured");
      },
    },
  };
}

async function waitFor(condition, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

test("runTaskDefinition sends final task output through chat service after completion", async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-task-manual-auto-send-"),
  );
  const runtime = createRuntime(rootPath);
  const chatService = new ChatService(null);
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const calls = [];
  const invokeCalls = [];

  runtime.invoke.invoke = async ({ service, action, payload }) => {
    invokeCalls.push({ service, action, payload });
    const result = await chatService.actions.send.execute({
      context: runtime,
      payload,
      serviceName: "chat",
      actionName: "send",
    });
    return {
      success: result.success,
      ...(result.data !== undefined ? { data: result.data } : {}),
      ...(result.error ? { error: result.error } : {}),
    };
  };

  registerChatSender(TELEGRAM_CHANNEL, {
    async sendText(payload) {
      calls.push(payload);
      return { success: true };
    },
  });

  try {
    await upsertChatMetaBySessionId({
      context: runtime,
      sessionId: SESSION_ID,
      channel: TELEGRAM_CHANNEL,
      chatId: "10001",
      messageId: "msg-task-1",
    });

    const created = await createTaskDefinition({
      projectRoot: rootPath,
      request: {
        title: "manual-run-auto-send",
        description: "验证 task 完成后自动回发",
        sessionId: SESSION_ID,
        when: "@manual",
        kind: "script",
        body: "printf 'task auto send ok\\n'",
      },
    });
    assert.equal(created.success, true);

    const result = await runTaskDefinition({
      context: runtime,
      projectRoot: rootPath,
      request: {
        title: "manual-run-auto-send",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.accepted, true);

    await waitFor(() => calls.length > 0);

    assert.equal(invokeCalls.length, 1);
    assert.equal(invokeCalls[0].service, "chat");
    assert.equal(invokeCalls[0].action, "send");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].chatId, "10001");
    assert.equal(calls[0].replyToMessage, true);
    assert.equal(calls[0].messageId, "msg-task-1");
    assert.equal(calls[0].text.trim(), "task auto send ok");
  } finally {
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
