/**
 * Chrome 扩展单 Agent gateway 连接源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - 本机 `town agent start` 默认 HTTP gateway 是 5314。
 * - 单 Agent gateway 没有 `/api/ui/agents`，扩展应在 404 时回退到 `/api/sdk/sessions`。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const STORAGE_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/storage.ts";
const CONSOLE_BASE_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/consoleBase.ts";
const API_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/downcityApi.ts";

test("extension defaults to local agent gateway and falls back from ui agents to sdk sessions", () => {
  const storageSource = readFileSync(STORAGE_FILE, "utf8");
  const consoleBaseSource = readFileSync(CONSOLE_BASE_FILE, "utf8");
  const apiSource = readFileSync(API_FILE, "utf8");

  assert.match(storageSource, /DEFAULT_SERVER_PORT\s*=\s*5314/u);
  assert.match(consoleBaseSource, /http:\/\/127\.0\.0\.1:5314/u);
  assert.match(apiSource, /buildSingleGatewayAgent/u);
  assert.match(apiSource, /api\/sdk\/sessions\?limit=1/u);
  assert.doesNotMatch(storageSource, /DEFAULT_SERVER_PORT\s*=\s*5315/u);
});
