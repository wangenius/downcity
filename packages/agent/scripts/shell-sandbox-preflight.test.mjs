/**
 * @file 验证 shell sandbox 启动前依赖诊断。
 *
 * 关键点（中文）
 * - 测试编译后的 bin 输出，避免测试文件进入 package 源码导出面。
 * - 通过注入探针模拟 Linux 依赖状态，不要求当前测试机安装 bwrap。
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  checkShellSandboxPreflightWithProbe,
} from "@downcity/shell/sandbox/SandboxPreflight.js";

async function withPlatform(platform, callback) {
  const previous = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
  try {
    return await callback();
  } finally {
    if (previous) {
      Object.defineProperty(process, "platform", previous);
    }
  }
}

function createProbe(params) {
  return {
    commandExists: async (command) => params.commands?.has(command) === true,
    readProcInt: async (filePath) => params.proc?.get(filePath) ?? null,
  };
}

test("Linux shell sandbox preflight reports missing bwrap and disabled userns", async () => {
  await withPlatform("linux", async () => {
    const result = await checkShellSandboxPreflightWithProbe(createProbe({
      commands: new Set(),
      proc: new Map([
        ["/proc/sys/kernel/unprivileged_userns_clone", 0],
        ["/proc/sys/user/max_user_namespaces", 0],
      ]),
    }));

    assert.equal(result.ok, false);
    assert.equal(result.backend, "linux-bubblewrap");
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ["missing-command", "userns-disabled"],
    );
    assert.match(result.issues[0].message, /bubblewrap/);
    assert.match(result.issues[1].message, /user namespaces/);
  });
});

test("Linux shell sandbox preflight accepts bwrap with enabled userns", async () => {
  await withPlatform("linux", async () => {
    const result = await checkShellSandboxPreflightWithProbe(createProbe({
      commands: new Set(["bwrap"]),
      proc: new Map([
        ["/proc/sys/kernel/unprivileged_userns_clone", 1],
        ["/proc/sys/user/max_user_namespaces", 1024],
      ]),
    }));

    assert.equal(result.ok, true);
    assert.equal(result.backend, "linux-bubblewrap");
    assert.deepEqual(result.issues, []);
  });
});

test("Unsupported platforms fail shell sandbox preflight", async () => {
  await withPlatform("win32", async () => {
    const result = await checkShellSandboxPreflightWithProbe(createProbe({
      commands: new Set(),
      proc: new Map(),
    }));

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.issues.map((issue) => issue.code),
      ["unsupported-platform"],
    );
  });
});
