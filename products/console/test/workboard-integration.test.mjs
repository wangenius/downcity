/**
 * Console UI workboard 接入回归测试。
 *
 * 关键点（中文）
 * - console 必须通过 runtime workboard route 读取数据。
 * - workboard 必须以独立 section 形式接入页面，而不是散落在已有卡片中。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardApiPath = path.resolve(import.meta.dirname, "../src/lib/dashboard-api.ts");
const appPath = path.resolve(import.meta.dirname, "../src/App.tsx");

test("console dashboard api should expose workboard snapshot route", () => {
  const source = fs.readFileSync(dashboardApiPath, "utf-8");

  assert.match(source, /workboardSnapshot:\s*\(\)\s*=>\s*"\/api\/workboard\/snapshot"/);
});

test("console app should render a dedicated workboard section", () => {
  const source = fs.readFileSync(appPath, "utf-8");

  assert.match(source, /WorkboardSection/);
});
