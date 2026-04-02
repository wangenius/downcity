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
import { getRequestContext, withRequestContext } from "../../bin/sessions/RequestContext.js";

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

test("AcpSessionRuntime: injects requestId for prompter when request context is missing", async () => {
  const runtime = new AcpSessionRuntime({
    rootPath: process.cwd(),
    sessionId: "test-session",
    logger: createLogger(),
    persistor: createPersistor(),
    prompter: {
      async resolve() {
        const ctx = getRequestContext();
        assert.equal(String(ctx?.sessionId || "").trim(), "test-session");
        assert.ok(String(ctx?.requestId || "").trim().length > 0);
        return [
          {
            role: "system",
            content: "System prompt",
          },
        ];
      },
    },
    launch: {
      type: "kimi",
      command: process.execPath,
      args: [fixturePath],
      env: {},
    },
  });
  try {
    const result = await runtime.run({
      query: "hello",
    });
    assert.equal(result.success, true);
    assert.match(String(result.assistantMessage.parts[0].text || ""), /System prompt/);
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionRuntime: emits assistant progress callbacks while prompt is streaming", async () => {
  const runtime = createRuntime();
  const steps = [];
  try {
    const result = await withRequestContext({
      sessionId: "test-session",
      requestId: "req_progress",
      onAssistantStepCallback: async (input) => {
        steps.push({
          text: String(input.text || ""),
          stepIndex: input.stepIndex,
        });
      },
    }, async () => {
      return await runtime.run({
        query: "stream progress test",
      });
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "第一段输出，第二段输出。第三段收尾");
    assert.deepEqual(steps, [
      {
        text: "第一段输出，第二段输出。第三段收尾",
        stepIndex: 1,
      },
    ]);
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionRuntime: maps Claude ACP tool_call_update into tool results", async () => {
  const runtime = createRuntime();
  const steps = [];
  try {
    const result = await withRequestContext({
      sessionId: "test-session",
      requestId: "req_toolcall",
      onAssistantStepCallback: async (input) => {
        steps.push({
          text: String(input.text || ""),
          stepIndex: input.stepIndex,
          stepResult: input.stepResult,
        });
      },
    }, async () => {
      return await runtime.run({
        query: "tool call stream test",
      });
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "正在分析项目结构...分析完成，这是最终结果。");
    assert.deepEqual(steps, [
      {
        text: "正在分析项目结构...",
        stepIndex: 1,
        stepResult: undefined,
      },
      {
        text: "",
        stepIndex: 2,
        stepResult: {
          toolCalls: [
            {
              toolCallId: "call_001",
              toolName: "list_files",
              input: {
                path: ".",
              },
              status: "pending",
            },
          ],
        },
      },
      {
        text: "",
        stepIndex: 3,
        stepResult: {
          toolResults: [
            {
              toolCallId: "call_001",
              toolName: "list_files",
              result: {
                files: ["package.json", "src/index.ts"],
              },
              status: "completed",
            },
          ],
        },
      },
      {
        text: "分析完成，这是最终结果。",
        stepIndex: 4,
        stepResult: undefined,
      },
    ]);
  } finally {
    await runtime.dispose();
  }
});
