/**
 * Console UI skills 路由回归测试。
 *
 * 关键点（中文）
 * - skill 已迁到 plugin action 体系，不应再通过 service command 调用。
 * - 这里用最小静态断言锁定 console-ui 的调用协议，防止旧字段被重新引入。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardQueriesPath = path.resolve(
  import.meta.dirname,
  "../src/lib/dashboard-queries.ts",
);

test("skills dashboard queries should use plugin action endpoint", () => {
  const source = fs.readFileSync(dashboardQueriesPath, "utf-8");

  assert.match(source, /dashboardApiRoutes\.pluginsAction\(\)/);
  assert.match(source, /pluginName:\s*"skill"/);
  assert.match(source, /actionName:\s*command/);
  assert.doesNotMatch(source, /serviceName:\s*"skill"/);
});
