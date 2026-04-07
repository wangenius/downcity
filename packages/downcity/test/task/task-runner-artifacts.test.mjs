/**
 * Task runner 产物写入测试（node:test）。
 *
 * 关键点（中文）
 * - `runTaskNow` 应生成稳定的 run 产物文件集合。
 * - `result.md` 应包含关键摘要字段与 artifact 链接，避免后续重构打散输出语义。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTaskDefinition } from "../../bin/services/task/Action.js";
import { runTaskNow } from "../../bin/services/task/runtime/Runner.js";

function createRuntime(rootPath) {
  return {
    cwd: rootPath,
    rootPath,
    env: {},
    config: {},
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
  };
}

test("runTaskNow writes stable task artifact files and summary", async () => {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-task-runner-artifacts-"),
  );
  const runtime = createRuntime(rootPath);

  try {
    const created = await createTaskDefinition({
      projectRoot: rootPath,
      request: {
        title: "runner-artifacts",
        description: "验证 run 产物写入",
        sessionId: "ctx_runner_artifacts",
        when: "@manual",
        kind: "script",
        body: "printf 'runner-artifacts-ok\\n'",
      },
    });
    assert.equal(created.success, true);

    const result = await runTaskNow({
      context: runtime,
      taskId: "runner-artifacts",
      trigger: {
        type: "manual",
      },
      projectRoot: rootPath,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "success");

    const files = await fs.readdir(result.runDir);
    assert.ok(files.includes("input.md"));
    assert.ok(files.includes("output.md"));
    assert.ok(files.includes("result.md"));
    assert.ok(files.includes("run.json"));
    assert.ok(files.includes("run-progress.json"));
    assert.ok(files.includes("dialogue.md"));
    assert.ok(files.includes("dialogue.json"));

    const resultMd = await fs.readFile(path.join(result.runDir, "result.md"), "utf-8");
    assert.match(resultMd, /# Task Result/);
    assert.match(resultMd, /status: \*\*SUCCESS\*\*/);
    assert.match(resultMd, /resultStatus: `valid`/);
    assert.match(resultMd, /## Artifacts/);
    assert.match(resultMd, /messages\.jsonl/);
    assert.match(resultMd, /dialogue\.md/);

    const outputMd = await fs.readFile(path.join(result.runDir, "output.md"), "utf-8");
    assert.match(outputMd, /runner-artifacts-ok/);
  } finally {
    await fs.rm(rootPath, { recursive: true, force: true });
  }
});
