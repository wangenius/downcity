/**
 * @file 验证 CLI 的 Windows 平台命令与进程模型。
 *
 * 关键点（中文）
 * - 只测试纯函数结果，不在测试进程上真实调用 taskkill。
 * - Windows 全局包管理命令必须使用 `.cmd` shim。
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildGlobalUpdateInvocation } from "../bin/city/shared/Update.js";
import { buildDetachedProcessSignalTargets } from "../bin/city/process/registry/ProcessSweep.js";

async function with_platform(platform, callback) {
  const previous = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { configurable: true, value: platform });
  try {
    return await callback();
  } finally {
    if (previous) Object.defineProperty(process, "platform", previous);
  }
}

test("Windows package manager invocations use cmd shims", () => {
  assert.deepEqual(buildGlobalUpdateInvocation("npm", "downcity", "win32"), {
    command: "npm.cmd",
    args: ["install", "-g", "downcity@latest"],
  });
  assert.deepEqual(buildGlobalUpdateInvocation("pnpm", "downcity", "win32"), {
    command: "pnpm.cmd",
    args: ["add", "-g", "downcity@latest"],
  });
});

test("Windows detached processes use one positive PID target", async () => {
  await with_platform("win32", async () => {
    assert.deepEqual(buildDetachedProcessSignalTargets(4321), [4321]);
  });
});
