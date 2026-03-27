/**
 * 专用 action API 调度测试（node:test）。
 *
 * 关键点（中文）
 * - 直接调用 `/service/<service>/<action>` 时，也应接入统一持久化 schedule。
 * - route 层需要先剥离 `delay/time`，避免 action 本身再次做二次调度。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Hono } from "hono";
import {
  controlServiceRuntime,
  registerAllServicesForServer,
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
const CHAT_KEY = "ctx_schedule_api_test";

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

test("dedicated action api uses persistent schedule for chat send", { concurrency: false }, async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-service-api-schedule-"),
  );
  const runtime = buildRuntime(rootPath);
  const previous = getChatSender(TELEGRAM_CHANNEL);
  const calls = [];
  const app = new Hono();

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
    registerAllServicesForServer(app, runtime);
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

    const response = await app.request("/service/chat/send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chatKey: CHAT_KEY,
        text: "scheduled-via-action-api",
        time: new Date(Date.now() + 120).toISOString(),
      }),
    });
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.scheduled, true);
    assert.equal(calls.length, 0);

    const store = new ServiceScheduleStore(rootPath);
    try {
      const job = store.getJobById(body.data.jobId);
      assert.ok(job);
      assert.equal(job.status, "pending");
    } finally {
      store.close();
    }

    await new Promise((resolve) => setTimeout(resolve, 800));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].payload.text, "scheduled-via-action-api");

    const verifyStore = new ServiceScheduleStore(rootPath);
    try {
      const job = verifyStore.getJobById(body.data.jobId);
      assert.ok(job);
      assert.equal(job.status, "succeeded");
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
