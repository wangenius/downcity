/**
 * ACP session runtime 测试。
 *
 * 关键点（中文）
 * - 使用本地 fixture agent，避免依赖真实 codex/claude/kimi 安装。
 * - 验证首次 bootstrap、后续 prompt 与权限请求自动放行。
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AcpSessionRuntime } from "../../bin/sessions/acp/AcpSessionRuntime.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "../fixtures/acp-agent-fixture.mjs");

function createLogger() {
  return {
    async log() {
      return;
    },
    warn() {
      return;
    },
  };
}

function createPersistor(historyTexts = []) {
  return {
    async list() {
      return historyTexts.map((text, index) => ({
        id: `m_${index + 1}`,
        role: index % 2 === 0 ? "user" : "assistant",
        metadata: {
          v: 1,
          ts: Date.now(),
          sessionId: "test-session",
        },
        parts: [{ type: "text", text }],
      }));
    },
    assistantText({ text, metadata }) {
      return {
        id: "assistant_message",
        role: "assistant",
        metadata: {
          v: 1,
          ts: Date.now(),
          ...metadata,
        },
        parts: [{ type: "text", text }],
      };
    },
  };
}

function createPrompter(systemText = "System prompt") {
  return {
    async resolve() {
      return [
        {
          role: "system",
          content: systemText,
        },
      ];
    },
  };
}

function createRuntime(params = {}) {
  return new AcpSessionRuntime({
    rootPath: process.cwd(),
    sessionId: "test-session",
    logger: createLogger(),
    persistor: createPersistor(params.historyTexts || []),
    prompter: createPrompter(params.systemText),
    launch: {
      type: "kimi",
      command: process.execPath,
      args: [fixturePath],
      env: {},
    },
  });
}

test("AcpSessionRuntime: first prompt bootstraps system and history", async () => {
  const runtime = createRuntime({
    historyTexts: ["old user", "old assistant"],
  });
  try {
    const result = await runtime.run({
      query: "hello",
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "BOOTSTRAP_OK");
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionRuntime: later prompt reuses remote session without bootstrap wrapper", async () => {
  const runtime = createRuntime({
    historyTexts: ["old user", "old assistant"],
  });
  try {
    await runtime.run({
      query: "hello",
    });
    const result = await runtime.run({
      query: "follow up",
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "ECHO:follow up");
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionRuntime: auto-selects allow_once for permission requests", async () => {
  const runtime = createRuntime();
  try {
    const result = await runtime.run({
      query: "permission test",
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "PERMISSION_OK");
  } finally {
    await runtime.dispose();
  }
});
