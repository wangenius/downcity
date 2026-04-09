/**
 * Console UI 运行态恢复测试（node:test）。
 *
 * 关键点（中文）
 * - pid 文件缺失时，仍应能从 detached UI 进程命令行恢复运行状态。
 * - host 需要先归一化后再做匹配，避免 `0.0.0.0` 与 `127.0.0.1` 误判不一致。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  findReusableConsoleProcess,
  parseConsoleProcessCommand,
  resolveConsoleHostForBinding,
} from "../../bin/main/modules/cli/Console.js";
import { isDowncityCliCommand } from "../../bin/main/city/runtime/ProcessSweep.js";

test("parseConsoleProcessCommand extracts host and port from console ui run command", () => {
  const result = parseConsoleProcessCommand(
    "/opt/homebrew/bin/node /tmp/Index.js console run --host 127.0.0.1 --port 5315",
  );

  assert.deepEqual(result, {
    host: "127.0.0.1",
    port: 5315,
  });
});

test("findReusableConsoleProcess reuses detached ui process with matching normalized host and port", () => {
  const result = findReusableConsoleProcess(
    [
      {
        pid: 20001,
        command:
          "/opt/homebrew/bin/node /tmp/Index.js console run --host 0.0.0.0 --port 5315",
      },
      {
        pid: 20002,
        command:
          "/opt/homebrew/bin/node /tmp/Index.js console run --host 127.0.0.1 --port 5415",
      },
    ],
    {
      host: "127.0.0.1",
      port: 5315,
    },
  );

  assert.deepEqual(result, {
    pid: 20001,
    host: "127.0.0.1",
    port: 5315,
  });
});

test("isDowncityCliCommand accepts console build output path", () => {
  assert.equal(
    isDowncityCliCommand(
      "/opt/homebrew/bin/node /Users/demo/packages/downcity/bin/main/modules/cli/Index.js console run --host 127.0.0.1 --port 5315",
    ),
    true,
  );
});

test("resolveConsoleHostForBinding uses wildcard host when public mode is enabled", () => {
  assert.equal(
    resolveConsoleHostForBinding({
      public: true,
    }),
    "0.0.0.0",
  );
});
