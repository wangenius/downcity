/**
 * Task 手动执行返回文案测试（node:test）。
 *
 * 关键点（中文）
 * - 手动执行是“异步受理”，因此需要在首个返回中明确告诉调用方不要等待 task 完成。
 * - `message` 应明确表达：任务已开始、完成后会自动发送给用户、可以直接继续后续流程。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTaskDefinition,
  runTaskDefinition,
} from "../../bin/services/task/Action.js";

function createRuntime(rootPath) {
  return {
    cwd: rootPath,
    rootPath,
    env: {},
    config: {},
    systems: [],
    logger: {
      warn() {},
      info() {},
      error() {},
      debug() {},
      log() {},
    },
  };
}

async function waitForTaskRunToSettle(rootPath, title) {
  const taskDir = path.join(rootPath, ".downcity", "task", title);
  for (let i = 0; i < 20; i += 1) {
    try {
      const entries = await fs.readdir(taskDir, { withFileTypes: true });
      const runDirs = entries.filter((entry) => entry.isDirectory());
      if (runDirs.length > 0) {
        const runJsonPath = path.join(taskDir, runDirs[0].name, "run.json");
        await fs.access(runJsonPath);
        return;
      }
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

test("runTaskDefinition returns guidance message for manual async acceptance", async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-task-manual-message-"),
  );
  const runtime = createRuntime(rootPath);

  try {
    const created = await createTaskDefinition({
      projectRoot: rootPath,
      request: {
        title: "manual-run-message",
        description: "验证手动执行返回文案",
        sessionId: "ctx_manual_message",
        when: "@manual",
        kind: "script",
        body: "printf 'manual-run-ok\\n'",
      },
    });
    assert.equal(created.success, true);

    const result = await runTaskDefinition({
      context: runtime,
      projectRoot: rootPath,
      request: {
        title: "manual-run-message",
      },
    });

    assert.equal(result.success, true);
    assert.equal(result.accepted, true);
    assert.equal(
      result.message,
      "任务已经开始执行，完成后 task 会自动发送给用户。请直接继续后续流程，无需等待 task 完成。",
    );
    assert.match(String(result.executionId || ""), /^manual-run-message:\d+$/);

    // 关键点（中文）：等待后台 task 完成落盘，避免清理临时目录时与异步写入发生竞争。
    await waitForTaskRunToSettle(rootPath, "manual-run-message");
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
