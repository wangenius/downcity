/**
 * Chrome 扩展后台 HTTP 桥源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - Inline Composer 不能在 content script 中直接请求 HTTP Console。
 * - Manifest 必须注册 background service worker 承接网络请求。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const MANIFEST_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/public/manifest.json";
const ROUTE_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/inline-composer/route.ts";
const VITE_CONFIG_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/vite.config.ts";

test("inline composer console requests are routed through background service worker", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_FILE, "utf8"));
  const routeSource = readFileSync(ROUTE_FILE, "utf8");
  const viteSource = readFileSync(VITE_CONFIG_FILE, "utf8");

  assert.deepEqual(manifest.background, {
    service_worker: "background.js",
    type: "module",
  });
  assert.match(viteSource, /src\/background\/main\.ts/u);
  assert.match(viteSource, /return "background\.js"/u);
  assert.match(routeSource, /requestViaBackground/u);
  assert.doesNotMatch(routeSource, /await\s+fetch\s*\(/u);
});
