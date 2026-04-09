/**
 * agent chat spinner 测试。
 *
 * 关键点（中文）
 * - 仅在交互式终端的人类可读输出里展示 spinner。
 * - `--json` 这类结构化输出不能混入 spinner 文本，避免污染结果。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  createAgentReplySpinner,
  runWithAgentReplySpinner,
  shouldRenderAgentReplySpinner,
} from "../../bin/main/modules/cli/AgentChat.js";

function createTtyStream() {
  return {
    isTTY: true,
  };
}

test("shouldRenderAgentReplySpinner enables spinner for tty text mode", () => {
  assert.equal(
    shouldRenderAgentReplySpinner({
      json: false,
      stdin: createTtyStream(),
      stdout: createTtyStream(),
    }),
    true,
  );
});

test("shouldRenderAgentReplySpinner disables spinner for json mode", () => {
  assert.equal(
    shouldRenderAgentReplySpinner({
      json: true,
      stdin: createTtyStream(),
      stdout: createTtyStream(),
    }),
    false,
  );
});

test("runWithAgentReplySpinner starts and stops spinner around async task", async () => {
  const calls = [];
  const result = await runWithAgentReplySpinner(
    async () => {
      calls.push("task");
      return "ok";
    },
    {
      agentName: "lucas whitman",
      stdin: createTtyStream(),
      stdout: createTtyStream(),
      spinnerFactory(text) {
        calls.push(`factory:${text}`);
        return {
          start() {
            calls.push("start");
          },
          stop() {
            calls.push("stop");
          },
        };
      },
    },
  );

  assert.equal(result, "ok");
  assert.deepEqual(calls, [
    "factory:lucas whitman is replying...",
    "start",
    "task",
    "stop",
  ]);
});

test("runWithAgentReplySpinner skips spinner in json mode", async () => {
  const calls = [];
  const result = await runWithAgentReplySpinner(
    async () => {
      calls.push("task");
      return "ok";
    },
    {
      agentName: "lucas whitman",
      json: true,
      stdin: createTtyStream(),
      stdout: createTtyStream(),
      spinnerFactory() {
        calls.push("factory");
        return {
          start() {
            calls.push("start");
          },
          stop() {
            calls.push("stop");
          },
        };
      },
    },
  );

  assert.equal(result, "ok");
  assert.deepEqual(calls, ["task"]);
});

test("createAgentReplySpinner renders animated frames and clears the line on stop", async () => {
  const writes = [];
  const controls = [];
  const spinner = createAgentReplySpinner({
    text: "lucas whitman is replying...",
    intervalMs: 5,
    frames: ["a", "b"],
    stream: {
      isTTY: true,
      write(chunk) {
        writes.push(chunk);
      },
      clearLine(dir) {
        controls.push(`clear:${dir}`);
      },
      cursorTo(col) {
        controls.push(`cursor:${col}`);
      },
    },
  });

  spinner.start();
  await new Promise((resolve) => setTimeout(resolve, 16));
  spinner.stop();

  assert.equal(
    writes.some((item) => item.includes("a lucas whitman is replying...")),
    true,
  );
  assert.equal(
    writes.some((item) => item.includes("b lucas whitman is replying...")),
    true,
  );
  assert.equal(controls.includes("clear:0"), true);
  assert.equal(controls.includes("cursor:0"), true);
});
