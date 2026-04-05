/**
 * ChatService 实例状态测试（node:test）。
 *
 * 关键点（中文）
 * - chat channel runtime state 应该属于 ChatService 实例，而不是 module-global 单例。
 * - 停止一个实例时，不应影响另一个实例持有的 channel state。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { ChatService } from "../../bin/services/chat/ChatService.js";

function createFakeBot(label) {
  return {
    label,
    stopped: false,
    async stop() {
      this.stopped = true;
    },
  };
}

test("ChatService keeps channel state per instance", async () => {
  const serviceA = new ChatService(null);
  const serviceB = new ChatService(null);

  const botA = createFakeBot("a");
  const botB = createFakeBot("b");

  serviceA.channelState.telegram = botA;
  serviceB.channelState.telegram = botB;

  await serviceA.lifecycle.stop();

  assert.equal(botA.stopped, true);
  assert.equal(botB.stopped, false);
  assert.equal(serviceA.channelState.telegram, null);
  assert.equal(serviceB.channelState.telegram, botB);
  assert.notEqual(serviceA.channelState, serviceB.channelState);
});

function createRuntimeStub(rootPath) {
  return {
    cwd: rootPath,
    rootPath,
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
      action() {},
      log() {},
    },
    config: {
      name: "demo",
      version: "1.0.0",
      model: {
        primary: "default",
      },
      services: {
        chat: {
          channels: {},
          queue: {
            maxConcurrency: 1,
            mergeDebounceMs: 0,
            mergeMaxWaitMs: 0,
          },
        },
      },
    },
    env: {},
    systems: [],
    session: {
      get(sessionId) {
        return {
          sessionId,
          async run() {
            return {
              success: true,
            };
          },
          async appendUserMessage() {},
          async appendAssistantMessage() {},
          afterSessionUpdatedAsync() {
            return Promise.resolve();
          },
          clearExecutor() {},
          getExecutor() {
            return null;
          },
          getHistoryComposer() {
            return null;
          },
          isExecuting() {
            return false;
          },
        };
      },
      model: null,
    },
    invoke: {
      async invoke() {
        return {
          success: true,
        };
      },
    },
    services: {
      async invoke() {
        return {
          success: true,
        };
      },
    },
    plugins: {
      list() {
        return [];
      },
      async availability() {
        return {
          available: false,
        };
      },
      async runAction() {
        return {
          success: true,
        };
      },
      async pipeline(_point, value) {
        return value;
      },
      async guard() {},
      async effect() {},
      async resolve(_point, value) {
        return value;
      },
    },
  };
}

test("ChatService keeps queue worker per instance", async () => {
  const serviceA = new ChatService(null);
  const serviceB = new ChatService(null);
  const runtimeA = createRuntimeStub("/tmp/downcity-chat-service-a");
  const runtimeB = createRuntimeStub("/tmp/downcity-chat-service-b");

  await serviceA.lifecycle.start(runtimeA);
  await serviceB.lifecycle.start(runtimeB);

  assert.equal(serviceA.queueWorker instanceof Object, true);
  assert.equal(serviceB.queueWorker instanceof Object, true);
  assert.notEqual(serviceA.queueWorker, serviceB.queueWorker);

  const workerB = serviceB.queueWorker;
  await serviceA.lifecycle.stop(runtimeA);

  assert.equal(serviceA.queueWorker, null);
  assert.equal(serviceB.queueWorker, workerB);

  await serviceB.lifecycle.stop(runtimeB);
  assert.equal(serviceB.queueWorker, null);
});
