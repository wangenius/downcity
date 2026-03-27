/**
 * service schedule runtime 测试（node:test）。
 *
 * 关键点（中文）
 * - `runServiceCommand(..., schedule)` 应持久化创建调度任务。
 * - schedule runtime 启动后应自动执行到点任务，并在重启后恢复 pending 任务。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  controlServiceRuntime,
  runServiceCommand,
} from "../../bin/console/service/Manager.js";
import {
  startServiceScheduleRuntime,
  stopServiceScheduleRuntime,
} from "../../bin/console/service/schedule/Runtime.js";
import { ServiceScheduleStore } from "../../bin/console/service/schedule/Store.js";
import { upsertChatMetaBySessionId } from "../../bin/services/chat/runtime/ChatMetaStore.js";
import {
  getChatSender,
  registerChatSender,
  unregisterChatSender,
} from "../../bin/services/chat/runtime/ChatSendRegistry.js";

const TELEGRAM_CHANNEL = "telegram";
const CHAT_KEY = "ctx_schedule_runtime_test";

function buildRuntime(rootPath) {
  return {
    rootPath,
    env: {},
    config: {},
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
      log() {},
    },
  };
}

test("runServiceCommand creates persistent scheduled job and runtime executes it", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-service-schedule-"),
  );
  const runtime = buildRuntime(rootPath);
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const calls = [];

  registerChatSender(TELEGRAM_CHANNEL, {
    async sendText(payload) {
      calls.push({
        ts: Date.now(),
        payload,
      });
      return { success: true };
    },
  });

  try {
    await controlServiceRuntime({
      serviceName: "chat",
      action: "start",
      context: runtime,
    });
    await startServiceScheduleRuntime(runtime);

    await upsertChatMetaBySessionId({
      context: runtime,
      sessionId: CHAT_KEY,
      channel: TELEGRAM_CHANNEL,
      chatId: "10001",
    });

    const commandResult = await runServiceCommand({
      serviceName: "chat",
      command: "send",
      payload: {
        chatKey: CHAT_KEY,
        text: "scheduled-from-command",
      },
      schedule: {
        runAtMs: Date.now() + 120,
      },
      context: runtime,
    });

    assert.equal(commandResult.success, true);
    assert.equal(commandResult.data.scheduled, true);
    assert.equal(calls.length, 0);

    const store = new ServiceScheduleStore(rootPath);
    try {
      const created = store.getJobById(commandResult.data.jobId);
      assert.ok(created);
      assert.equal(created.status, "pending");
    } finally {
      store.close();
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.chatId, "10001");
    assert.equal(calls[0].payload.text, "scheduled-from-command");

    const verifyStore = new ServiceScheduleStore(rootPath);
    try {
      const executed = verifyStore.getJobById(commandResult.data.jobId);
      assert.ok(executed);
      assert.equal(executed.status, "succeeded");
    } finally {
      verifyStore.close();
    }
  } finally {
    await stopServiceScheduleRuntime();
    await controlServiceRuntime({
      serviceName: "chat",
      action: "stop",
      context: runtime,
    });
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});

test("service schedule runtime restores pending job after restart", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-service-schedule-recover-"),
  );
  const runtime = buildRuntime(rootPath);
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const calls = [];

  registerChatSender(TELEGRAM_CHANNEL, {
    async sendText(payload) {
      calls.push({
        ts: Date.now(),
        payload,
      });
      return { success: true };
    },
  });

  try {
    await controlServiceRuntime({
      serviceName: "chat",
      action: "start",
      context: runtime,
    });
    await upsertChatMetaBySessionId({
      context: runtime,
      sessionId: CHAT_KEY,
      channel: TELEGRAM_CHANNEL,
      chatId: "10001",
    });

    const store = new ServiceScheduleStore(rootPath);
    let jobId = "";
    try {
      const job = store.createJob({
        serviceName: "chat",
        actionName: "send",
        payload: {
          chatKey: CHAT_KEY,
          text: "recovered-job",
        },
        runAtMs: Date.now() + 100,
      });
      jobId = job.id;
    } finally {
      store.close();
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
    await startServiceScheduleRuntime(runtime);
    await new Promise((resolve) => setTimeout(resolve, 500));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.text, "recovered-job");

    const verifyStore = new ServiceScheduleStore(rootPath);
    try {
      const recovered = verifyStore.getJobById(jobId);
      assert.ok(recovered);
      assert.equal(recovered.status, "succeeded");
    } finally {
      verifyStore.close();
    }
  } finally {
    await stopServiceScheduleRuntime();
    await controlServiceRuntime({
      serviceName: "chat",
      action: "stop",
      context: runtime,
    });
    if (previous) {
      registerChatSender(TELEGRAM_CHANNEL, previous);
    } else {
      unregisterChatSender(TELEGRAM_CHANNEL);
    }
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
