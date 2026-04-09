/**
 * CLI 端口提示测试（node:test）。
 *
 * 关键点（中文）
 * - 锁定启动输出里的端口说明，避免用户再次搞不清 5314/5315 的职责。
 * - 这里不测试版式，只测试语义内容。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildConsolePortFacts,
  buildRuntimePortFacts,
} from "../../bin/main/modules/cli/PortHints.js";

test("buildRuntimePortFacts explains the runtime API port", () => {
  assert.deepEqual(buildRuntimePortFacts(), [
    {
      label: "Port",
      value: "5314",
    },
    {
      label: "Usage",
      value: "Runtime API / service endpoints (health, service, task, plugin)",
    },
  ]);
});

test("buildConsolePortFacts explains the console UI port", () => {
  assert.deepEqual(buildConsolePortFacts("http://127.0.0.1:5315"), [
    {
      label: "URL",
      value: "http://127.0.0.1:5315",
    },
    {
      label: "Port",
      value: "5315",
    },
    {
      label: "Usage",
      value: "Console Web UI / control plane",
    },
  ]);
});
