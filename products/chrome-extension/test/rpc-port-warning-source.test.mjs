/**
 * Chrome 扩展 RPC 端口误用源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - 15314 是 Agent RPC 端口，不是浏览器 HTTP gateway。
 * - 设置页应明确提示用户改用 5314，而不是泛泛报“无法连接”。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OPTIONS_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/options/App.tsx";
const HINT_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/connectionHints.ts";

test("options warns when user configures rpc port 15314", () => {
  const optionsSource = readFileSync(OPTIONS_FILE, "utf8");
  const hintSource = readFileSync(HINT_FILE, "utf8");

  assert.match(optionsSource, /function\s+isRpcPortUrl/u);
  assert.match(optionsSource, /Town URL 请使用 http:\/\/127\.0\.0\.1:5314/u);
  assert.match(hintSource, /Agent RPC 端口/u);
  assert.match(hintSource, /Town URL 请使用 http:\/\/127\.0\.0\.1:5314/u);
});
