/**
 * Downcity 进程清理策略测试（node:test）。
 *
 * 关键点（中文）
 * - detached 进程会成为新的进程组 leader。
 * - stop/restart 必须优先向进程组发信号，否则 ACP/shell 等子进程可能被孤儿化。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDetachedProcessSignalTargets,
  shouldSweepDetachedCityCommand,
} from "../../bin/main/city/runtime/ProcessSweep.js";

test("buildDetachedProcessSignalTargets targets process group before pid on POSIX", () => {
  const targets = buildDetachedProcessSignalTargets(12345);

  if (process.platform === "win32") {
    assert.deepEqual(targets, [12345]);
    return;
  }

  assert.deepEqual(targets, [-12345, 12345]);
});

test("shouldSweepDetachedCityCommand distinguishes city runtime from console ui runtime", () => {
  const cityRuntime =
    "/opt/homebrew/bin/node /repo/packages/downcity/bin/main/modules/cli/Index.js run";
  const consoleRuntime =
    "/opt/homebrew/bin/node /repo/packages/downcity/bin/main/modules/cli/Index.js console run --host 127.0.0.1 --port 5315";

  assert.equal(
    shouldSweepDetachedCityCommand(cityRuntime, { includeConsole: true }),
    true,
  );
  assert.equal(
    shouldSweepDetachedCityCommand(consoleRuntime, { includeConsole: true }),
    false,
  );
  assert.equal(
    shouldSweepDetachedCityCommand(consoleRuntime, { includeUi: true }),
    true,
  );
});
