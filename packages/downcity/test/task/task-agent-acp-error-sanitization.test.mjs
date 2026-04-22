/**
 * Task agent ACP 错误归一化测试（node:test）。
 *
 * 关键点（中文）
 * - 当上游 Claude ACP 返回 `-32603` 且伴随 transport / hook 异常时，task 不应把原始 SDK 报错直接发给用户。
 * - 失败摘要应稳定、可诊断，并通过 chat send 回发归一化后的说明文本。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTaskDefinition } from "../../bin/services/task/Action.js";
import { runTaskNow } from "../../bin/services/task/runtime/Runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturePath = path.resolve(__dirname, "../fixtures/acp-agent-fixture.mjs");

function createRuntime(rootPath, sentTexts) {
  return {
    cwd: rootPath,
    rootPath,
    env: {},
    config: {
      execution: {
        type: "acp",
        agent: {
          type: "claude",
          command: process.execPath,
          args: [fixturePath],
        },
      },
    },
    paths: {
      getDowncityChannelDirPath: () => path.join(rootPath, ".downcity/channel"),
      getDowncityChannelMetaPath: () =>
        path.join(rootPath, ".downcity/channel/meta.json"),
      getCacheDirPath: () => path.join(rootPath, ".downcity/.cache"),
      getDowncitySessionDirPath: (sessionId) =>
        path.join(rootPath, ".downcity/session", sessionId),
    },
    systems: [],
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
      log() {},
    },
    invoke: {
      async invoke({ payload }) {
        sentTexts.push(String(payload?.text || ""));
        return { success: true, data: {} };
      },
    },
  };
}

test("runTaskNow sanitizes ACP internal transport failures before chat dispatch", async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-task-agent-acp-error-"),
  );
  const sentTexts = [];
  const runtime = createRuntime(rootPath, sentTexts);

  try {
    const created = await createTaskDefinition({
      projectRoot: rootPath,
      request: {
        title: "task-agent-acp-error-sanitization",
        description: "验证 ACP 内部错误归一化",
        sessionId: "ctx_task_agent_acp_error",
        when: "@manual",
        kind: "agent",
        body: "persistent transport error test",
      },
    });
    assert.equal(created.success, true);

    const result = await runTaskNow({
      context: runtime,
      taskId: "task-agent-acp-error-sanitization",
      trigger: {
        type: "manual",
      },
      projectRoot: rootPath,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "failure");
    assert.equal(result.executionStatus, "failure");
    assert.equal(sentTexts.length, 1);
    assert.match(sentTexts[0], /Claude ACP 运行时在生成结果前失败/);
    assert.doesNotMatch(sentTexts[0], /Internal error \(code=-32603\)/);
    assert.doesNotMatch(sentTexts[0], /ProcessTransport is not ready for writing/);
    assert.doesNotMatch(sentTexts[0], /CLI output was not valid JSON/);

    const errorMd = await fs.readFile(path.join(result.runDir, "error.md"), "utf-8");
    assert.match(errorMd, /Claude ACP 运行时在生成结果前失败/);
    assert.doesNotMatch(errorMd, /Internal error \(code=-32603\)/);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
