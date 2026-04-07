/**
 * LocalSessionCore memory 接入测试（node:test）。
 *
 * 关键点（中文）
 * - recall 应在本轮 system 组装阶段注入少量相关记忆。
 * - capture 应在本轮完成后把当前问答交给 memory runtime。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { LocalSessionCore } from "../../bin/session/executors/local/LocalSessionCore.js";

function createLoggerStub() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
    action() {},
    async log() {},
  };
}

function createCore(params = {}) {
  const historyComposer = {
    sessionId: "chat-memory-1",
    async prepare() {
      return [];
    },
    userText(input) {
      return {
        role: "user",
        parts: [{ type: "text", text: String(input?.text || "") }],
        metadata: {
          v: 1,
          ts: Date.now(),
          sessionId: "chat-memory-1",
        },
      };
    },
  };

  const core = new LocalSessionCore({
    model: {},
    logger: createLoggerStub(),
    historyComposer,
    compactionComposer: {
      async run() {
        return { compacted: false };
      },
      shouldCompactOnError() {
        return false;
      },
    },
    executionComposer: {
      async compose() {
        return { tools: {} };
      },
      buildFallbackAssistantMessage(text) {
        return {
          role: "assistant",
          parts: [{ type: "text", text: String(text || "") }],
          metadata: {
            v: 1,
            ts: Date.now(),
            sessionId: "chat-memory-1",
          },
        };
      },
      createOnStepFinishHandler() {
        return async () => {};
      },
      createPrepareStepHandler() {
        return async () => ({ messages: [] });
      },
    },
    systemComposer: {
      async resolve() {
        return [{ role: "system", content: "基础 system" }];
      },
    },
    ...(params.memoryRuntime ? { memoryRuntime: params.memoryRuntime } : {}),
  });

  return { core, historyComposer };
}

test("prepareExecuteInput injects recalled memory into system messages", async () => {
  const { core } = createCore({
    memoryRuntime: {
      async recall() {
        return {
          items: [
            {
              path: ".downcity/memory/MEMORY.md",
              citation: ".downcity/memory/MEMORY.md#L1-L4",
              snippet: "用户偏好简洁的发布说明。",
              score: 0.92,
              source: "longterm",
            },
          ],
        };
      },
      async capture() {},
    },
  });

  const prepared = await core.prepareExecuteInput("发布说明怎么写");

  assert.equal(prepared.system.length, 2);
  assert.match(String(prepared.system[1]?.content || ""), /历史记忆/);
  assert.match(String(prepared.system[1]?.content || ""), /用户偏好简洁的发布说明/);
  assert.match(String(prepared.system[1]?.content || ""), /MEMORY\.md#L1-L4/);
});

test("captureTurnMemory forwards current turn to memory runtime", async () => {
  let captured = null;
  const { core } = createCore({
    memoryRuntime: {
      async recall() {
        return { items: [] };
      },
      async capture(input) {
        captured = input;
      },
    },
  });

  await core.captureTurnMemory({
    query: "给我写一版发布说明",
    assistantMessage: {
      role: "assistant",
      parts: [{ type: "text", text: "这是简洁版本的发布说明。" }],
      metadata: {
        v: 1,
        ts: Date.now(),
        sessionId: "chat-memory-1",
      },
    },
  });

  assert.deepEqual(captured, {
    sessionId: "chat-memory-1",
    query: "给我写一版发布说明",
    assistantText: "这是简洁版本的发布说明。",
  });
});
