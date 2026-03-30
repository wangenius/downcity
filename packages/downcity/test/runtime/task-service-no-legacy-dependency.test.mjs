/**
 * TaskService 架构收口测试（node:test）。
 *
 * 关键点（中文）
 * - TaskService 应该成为真正独立的 class service。
 * - 它不应该再依赖 legacy `services/task/Index` 导出的 `taskService`。
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";

test("TaskService no longer depends on legacy task Index module", async () => {
  const filePath = path.resolve(
    process.cwd(),
    "bin/services/task/TaskService.js",
  );
  const content = await fs.readFile(filePath, "utf8");

  assert.equal(content.includes("Index.js"), false);
  assert.equal(content.includes("legacyTaskService"), false);
});
