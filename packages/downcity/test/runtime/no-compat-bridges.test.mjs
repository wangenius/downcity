/**
 * 兼容桥接入口清理测试（node:test）。
 *
 * 关键点（中文）
 * - 既然当前项目不要求向后兼容，就不应继续产出旧命名桥接文件。
 * - 这里直接约束编译产物中不再存在这些兼容入口。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const BIN_ROOT = new URL("../../bin/", import.meta.url).pathname;

test("build output no longer includes legacy compatibility bridge files", () => {
  const legacyFiles = [
    "agent/AgentRuntime.js",
    "agent/ExecutionRuntime.js",
    "sessions/SessionRegistry.js",
    "sessions/SessionRuntimeRegistry.js",
    "main/ui/AgentRuntimeApiRoutes.js",
    "main/service/RuntimeController.js",
    "main/commands/IndexConsoleRuntime.js",
    "types/ServiceRuntime.js",
  ];

  for (const relPath of legacyFiles) {
    assert.equal(
      existsSync(join(BIN_ROOT, relPath)),
      false,
      `legacy bridge should be removed: ${relPath}`,
    );
  }
});
