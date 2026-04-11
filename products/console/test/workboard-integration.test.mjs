/**
 * Console UI workboard 接入回归测试。
 *
 * 关键点（中文）
 * - console 必须通过 runtime workboard route 读取数据。
 * - workboard 必须以独立 main view 形式接入页面，而不是塞在 overview 下。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const dashboardApiPath = path.resolve(import.meta.dirname, "../src/lib/dashboard-api.ts");
const appPath = path.resolve(import.meta.dirname, "../src/App.tsx");
const navigationPath = path.resolve(import.meta.dirname, "../src/lib/dashboard-navigation.ts");
const routePath = path.resolve(import.meta.dirname, "../src/lib/dashboard-route.ts");

test("console dashboard api should expose workboard snapshot route", () => {
  const source = fs.readFileSync(dashboardApiPath, "utf-8");

  assert.match(source, /workboardSnapshot:\s*\(\)\s*=>\s*"\/api\/workboard\/snapshot"/);
});

test("console navigation should expose global workboard main view", () => {
  const navigationSource = fs.readFileSync(navigationPath, "utf-8");
  const routeSource = fs.readFileSync(routePath, "utf-8");

  assert.match(navigationSource, /globalWorkboard/);
  assert.match(routeSource, /\/global\/workboard/);
});

test("console app should render a dedicated workboard main view", () => {
  const source = fs.readFileSync(appPath, "utf-8");

  assert.match(source, /case "globalWorkboard"/);
  assert.doesNotMatch(source, /case "agentWorkboard"/);
});
