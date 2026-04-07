/**
 * LocalSessionCore 与 memory 解耦测试（node:test）。
 *
 * 关键点（中文）
 * - LocalSessionCore 只消费 systemComposer，不直接注入 memory。
 * - session 执行内核不应承载 memory service 的 recall / capture 逻辑。
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

function createCore() {
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
  });

  return { core, historyComposer };
}

test("prepareExecuteInput only uses systemComposer output", async () => {
  const { core } = createCore();

  const prepared = await core.prepareExecuteInput("发布说明怎么写");

  assert.equal(prepared.system.length, 1);
  assert.equal(String(prepared.system[0]?.content || ""), "基础 system");
});

test("LocalSessionCore does not expose memory-specific helpers", () => {
  const { core } = createCore();

  assert.equal(typeof core.recallMemorySystemMessage, "undefined");
  assert.equal(typeof core.captureTurnMemory, "undefined");
});
