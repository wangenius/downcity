/**
 * ACP session runtime 测试。
 *
 * 关键点（中文）
 * - 使用本地 fixture agent，避免依赖真实 codex/claude/kimi 安装。
 * - 验证首次 bootstrap、后续 prompt 与权限请求自动放行。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AcpSessionExecutor } from "../../bin/session/executors/acp/AcpSessionExecutor.js";
import { getSessionRunScope, withSessionRunScope } from "../../bin/session/SessionRunScope.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "../fixtures/acp-agent-fixture.mjs");
const consoleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "downcity-acp-console-"));
process.env.DC_CONSOLE_ROOT = consoleRoot;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs = 2_000, intervalMs = 10) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (await check()) return;
    await sleep(intervalMs);
  }
  throw new Error(`waitFor timeout after ${timeoutMs}ms`);
}

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

function createHistoryComposer(historyTexts = []) {
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

function createSystemComposer(systemText = "System prompt") {
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
  return new AcpSessionExecutor({
    rootPath: process.cwd(),
    sessionId: "test-session",
    logger: createLogger(),
    historyComposer: createHistoryComposer(params.historyTexts || []),
    systemComposer: createSystemComposer(params.systemText),
    launch: {
      type: "kimi",
      command: process.execPath,
      args: [fixturePath],
      env: {},
    },
  });
}

test("AcpSessionExecutor: first prompt bootstraps system and history", async () => {
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

test("AcpSessionExecutor: later prompt reuses remote session without bootstrap wrapper", async () => {
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

test("AcpSessionExecutor: auto-selects allow_once for permission requests", async () => {
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

test("AcpSessionExecutor: injects sessionId for prompt resolver when request context is missing", async () => {
  const runtime = new AcpSessionExecutor({
    rootPath: process.cwd(),
    sessionId: "test-session",
    logger: createLogger(),
    historyComposer: createHistoryComposer(),
    systemComposer: {
      async resolve() {
        const ctx = getSessionRunScope();
        assert.equal(String(ctx?.sessionId || "").trim(), "test-session");
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
    assert.equal(result.assistantMessage.parts[0].text, "ECHO:hello");
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: emits assistant progress callbacks while prompt is streaming", async () => {
  const runtime = createRuntime();
  const steps = [];
  try {
    const result = await withSessionRunScope({
      sessionId: "test-session",
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

test("AcpSessionExecutor: accepts final response before ACP process exits normally", async () => {
  const runtime = createRuntime();
  try {
    const result = await runtime.run({
      query: "exit after response test",
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "KIMI_EXIT_OK");
    assert.equal(result.assistantMessage.metadata.extra.stopReason, "end_turn");
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: missing ACP command rejects run instead of crashing process", async () => {
  const runtime = new AcpSessionExecutor({
    rootPath: process.cwd(),
    sessionId: "test-session",
    logger: createLogger(),
    historyComposer: createHistoryComposer(),
    systemComposer: createSystemComposer(),
    launch: {
      type: "kimi",
      command: "__downcity_missing_kimi__",
      args: ["acp"],
      env: {},
    },
  });
  try {
    await assert.rejects(
      () =>
        runtime.run({
          query: "hello",
        }),
      /spawn __downcity_missing_kimi__ ENOENT/,
    );
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: does not inherit DC_AGENT_TOKEN into ACP child env", async () => {
  const previousAgentToken = process.env.DC_AGENT_TOKEN;
  process.env.DC_AGENT_TOKEN = "dc_agent_should_not_leak";
  const runtime = createRuntime();
  try {
    const result = await runtime.run({
      query: "env token test",
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "TOKEN_ABSENT");
  } finally {
    await runtime.dispose();
    if (previousAgentToken === undefined) delete process.env.DC_AGENT_TOKEN;
    else process.env.DC_AGENT_TOKEN = previousAgentToken;
  }
});

test("AcpSessionExecutor: maps Claude ACP tool_call_update into tool results", async () => {
  const runtime = createRuntime();
  const steps = [];
  try {
    const result = await withSessionRunScope({
      sessionId: "test-session",
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
    assert.equal(result.assistantMessage.parts[0].text, "分析完成，这是最终结果。");
    assert.deepEqual(steps, [
      {
        text: "",
        stepIndex: 1,
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
        stepIndex: 2,
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
        stepIndex: 3,
        stepResult: undefined,
      },
    ]);
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: exposes only tagged final text when ACP emits process chatter", async () => {
  const runtime = createRuntime();
  const steps = [];
  try {
    const result = await withSessionRunScope({
      sessionId: "test-session",
      onAssistantStepCallback: async (input) => {
        steps.push({
          text: String(input.text || ""),
          stepIndex: input.stepIndex,
          stepResult: input.stepResult,
        });
      },
    }, async () => {
      return await runtime.run({
        query: "final tag contract test",
      });
    });
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "FINAL_VISIBLE");
    assert.deepEqual(steps, [
      {
        text: "FINAL_VISIBLE",
        stepIndex: 1,
        stepResult: undefined,
      },
    ]);
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: cancels the current prompt turn when requested", async () => {
  const runtime = createRuntime();
  try {
    const runPromise = runtime.run({
      query: "cancel runtime test",
    });
    let cancelIssued = false;
    await waitFor(async () => {
      cancelIssued = (await runtime.requestCancelCurrentTurn?.()) === true;
      return cancelIssued;
    });
    assert.equal(cancelIssued, true);

    const result = await runPromise;
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.parts[0].text, "等待取消前的部分输出");
    assert.equal(result.assistantMessage.metadata.extra.stopReason, "cancelled");
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: cancellation without text still returns cancelled and keeps remote session", async () => {
  const runtime = createRuntime({
    historyTexts: ["old user", "old assistant"],
  });
  try {
    const runPromise = runtime.run({
      query: "cancel empty runtime test",
    });
    let cancelIssued = false;
    await waitFor(async () => {
      cancelIssued = (await runtime.requestCancelCurrentTurn?.()) === true;
      return cancelIssued;
    });
    assert.equal(cancelIssued, true);

    const cancelled = await runPromise;
    assert.equal(cancelled.success, true);
    assert.equal(cancelled.assistantMessage.parts[0].text, "");
    assert.equal(cancelled.assistantMessage.metadata.extra.stopReason, "cancelled");

    const next = await runtime.run({
      query: "follow up after reset test",
    });
    assert.equal(next.success, true);
    assert.equal(next.assistantMessage.parts[0].text, "RESET_NOT_BOOTSTRAPPED");
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: RPC internal error disposes stale remote session before next run", async () => {
  const runtime = createRuntime({
    historyTexts: ["old user", "old assistant"],
  });
  try {
    await assert.rejects(
      () =>
        runtime.run({
          query: "rpc error turn test",
        }),
      /Internal error \(code=-32603\)/,
    );

    const next = await runtime.run({
      query: "follow up after reset test",
    });
    assert.equal(next.success, true);
    assert.equal(next.assistantMessage.parts[0].text, "RESET_BOOTSTRAP_OK");
  } finally {
    await runtime.dispose();
  }
});

test("AcpSessionExecutor: defers cancel until pending tool call returns tool result", async () => {
  const runtime = createRuntime();
  const steps = [];
  try {
    const runPromise = withSessionRunScope({
      sessionId: "test-session",
      onAssistantStepCallback: async (input) => {
        steps.push({
          text: String(input.text || ""),
          stepIndex: input.stepIndex,
          stepResult: input.stepResult,
        });
      },
    }, async () => {
      return await runtime.run({
        query: "cancel after tool result test",
      });
    });

    await waitFor(() => steps.length >= 2);
    assert.equal(await runtime.requestCancelCurrentTurn?.(), true);

    const result = await runPromise;
    assert.equal(result.success, true);
    assert.equal(result.assistantMessage.metadata.extra.stopReason, "cancelled");
    assert.equal(result.assistantMessage.parts[0].text, "先发一段前置文本。");
    assert.deepEqual(steps, [
      {
        text: "",
        stepIndex: 1,
        stepResult: {
          toolCalls: [
            {
              toolCallId: "call_cancel_after_result",
              toolName: "search_tweets",
              input: {
                query: "AI artificial intelligence",
              },
              status: "pending",
            },
          ],
        },
      },
      {
        text: "",
        stepIndex: 2,
        stepResult: {
          toolResults: [
            {
              toolCallId: "call_cancel_after_result",
              toolName: "search_tweets",
              result: {
                items: ["tweet-1", "tweet-2"],
              },
              status: "completed",
            },
          ],
        },
      },
    ]);
  } finally {
    await runtime.dispose();
  }
});
