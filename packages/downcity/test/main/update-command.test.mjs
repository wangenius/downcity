/**
 * update 命令纯逻辑测试（node:test）。
 *
 * 关键点（中文）
 * - 只锁定包管理器推断与更新命令拼装，不触发真实全局安装。
 * - 避免测试依赖网络、全局权限或本机包管理器状态。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGlobalUpdateInvocation,
  resolveUpdateManagerFromGlobalRoots,
} from "../../bin/main/modules/cli/Update.js";

test("buildGlobalUpdateInvocation uses npm install -g by default path", () => {
  assert.deepEqual(buildGlobalUpdateInvocation("npm"), {
    command: "npm",
    args: ["install", "-g", "downcity@latest"],
  });
});

test("buildGlobalUpdateInvocation uses pnpm add -g for pnpm", () => {
  assert.deepEqual(buildGlobalUpdateInvocation("pnpm"), {
    command: "pnpm",
    args: ["add", "-g", "downcity@latest"],
  });
});

test("resolveUpdateManagerFromGlobalRoots detects pnpm install root first", () => {
  const manager = resolveUpdateManagerFromGlobalRoots({
    packageRoot: "/Users/demo/Library/pnpm/global/5/node_modules/downcity",
    npmRoot: "/usr/local/lib/node_modules",
    pnpmRoot: "/Users/demo/Library/pnpm/global/5/node_modules",
  });

  assert.equal(manager, "pnpm");
});

test("resolveUpdateManagerFromGlobalRoots detects npm install root", () => {
  const manager = resolveUpdateManagerFromGlobalRoots({
    packageRoot: "/usr/local/lib/node_modules/downcity",
    npmRoot: "/usr/local/lib/node_modules",
    pnpmRoot: "/Users/demo/Library/pnpm/global/5/node_modules",
  });

  assert.equal(manager, "npm");
});

test("resolveUpdateManagerFromGlobalRoots returns null when package root is unrelated", () => {
  const manager = resolveUpdateManagerFromGlobalRoots({
    packageRoot: "/Users/demo/Documents/github/downcity/packages/downcity",
    npmRoot: "/usr/local/lib/node_modules",
    pnpmRoot: "/Users/demo/Library/pnpm/global/5/node_modules",
  });

  assert.equal(manager, null);
});
