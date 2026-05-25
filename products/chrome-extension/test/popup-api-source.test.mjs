/**
 * Chrome 扩展 Popup API 源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - Popup API 层不能再用 sendBeacon 判成功，否则会把 401/500/503 误报成已发送。
 * - 发送函数应直接等待 JSON 响应，并在 `success !== true` 时抛错。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const API_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/downcityApi.ts";

test("popup execute api awaits requestJson and rejects false-success payloads", () => {
  const source = readFileSync(API_FILE, "utf8");

  assert.match(source, /export\s+async\s+function\s+executeAgentTask/u);
  assert.match(source, /await\s+requestJson<GenericApiResponse>\s*\(/u);
  assert.match(source, /payload\.success !== true/u);
  assert.doesNotMatch(source, /navigator\.sendBeacon/u);
  assert.doesNotMatch(source, /\.catch\(\(\)\s*=>\s*\{\}\)/u);
});
