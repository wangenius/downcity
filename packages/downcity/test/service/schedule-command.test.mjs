/**
 * service schedule 命令测试（node:test）。
 *
 * 关键点（中文）
 * - 直接验证 `city service schedule list/info/cancel` 的真实 CLI 行为。
 * - schedule 管理命令不依赖 runtime 在线，只依赖项目本地 `.downcity/schedule.sqlite`。
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { ServiceScheduleStore } from "../../bin/console/service/schedule/Store.js";

const execFile = promisify(execFileCallback);

async function createAgentProjectFixture() {
  const rootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "downcity-service-schedule-command-"),
  );
  await fs.writeFile(
    path.join(rootPath, "downcity.json"),
    `${JSON.stringify({ name: "schedule-fixture" }, null, 2)}\n`,
    "utf-8",
  );
  await fs.writeFile(path.join(rootPath, "PROFILE.md"), "# profile\n", "utf-8");
  return rootPath;
}

async function runCityCommand(args, cwd) {
  const { stdout } = await execFile(
    process.execPath,
    ["bin/console/commands/Index.js", ...args],
    {
      cwd,
      env: {
        ...process.env,
        NO_COLOR: "1",
      },
    },
  );
  return JSON.parse(stdout);
}

test("service schedule list/info/cancel commands manage local scheduled jobs", { concurrency: false }, async () => {
  const packageRoot = process.cwd();
  const projectRoot = await createAgentProjectFixture();
  const store = new ServiceScheduleStore(projectRoot);

  try {
    const pending = store.createJob({
      serviceName: "chat",
      actionName: "send",
      payload: {
        chatKey: "ctx_a",
        text: "pending job",
      },
      runAtMs: Date.now() + 60_000,
    });
    const failed = store.createJob({
      serviceName: "memory",
      actionName: "flush",
      payload: {
        contextId: "ctx_b",
      },
      runAtMs: Date.now() + 120_000,
    });
    store.markJobRunning(failed.id);
    store.markJobFailed(failed.id, "mock failure");

    const listOutput = await runCityCommand(
      ["service", "schedule", "list", "--path", projectRoot, "--status", "pending", "--json"],
      packageRoot,
    );
    assert.equal(listOutput.success, true);
    assert.equal(listOutput.status, "pending");
    assert.equal(listOutput.count, 1);
    assert.equal(listOutput.jobs[0].id, pending.id);

    const infoOutput = await runCityCommand(
      ["service", "schedule", "info", pending.id, "--path", projectRoot, "--json"],
      packageRoot,
    );
    assert.equal(infoOutput.success, true);
    assert.equal(infoOutput.job.id, pending.id);
    assert.equal(infoOutput.job.status, "pending");

    const cancelOutput = await runCityCommand(
      ["service", "schedule", "cancel", pending.id, "--path", projectRoot, "--json"],
      packageRoot,
    );
    assert.equal(cancelOutput.success, true);
    assert.equal(cancelOutput.job.id, pending.id);
    assert.equal(cancelOutput.job.status, "cancelled");

    const failedCancelOutput = await runCityCommand(
      ["service", "schedule", "cancel", failed.id, "--path", projectRoot, "--json"],
      packageRoot,
    );
    assert.equal(failedCancelOutput.success, false);
    assert.match(failedCancelOutput.error, /Only pending jobs can be cancelled/i);
  } finally {
    store.close();
    await fs.rm(projectRoot, { recursive: true, force: true });
  }
});
