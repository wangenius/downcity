/**
 * Chrome 扩展 Popup 发送链路源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - Popup 发送必须等待明确的 HTTP 成功，不能把“请求发出了”当成“发送成功”。
 * - Session 加载失败时必须保留错误态，不能回退成“准备就绪”误导用户。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const APP_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/extension-popup/App.tsx";

test("popup submit waits for executeAgentTask and does not swallow session fetch failures", () => {
  const source = readFileSync(APP_FILE, "utf8");

  assert.match(source, /await\s+executeAgentTask\s*\(/u);
  assert.doesNotMatch(source, /dispatchAgentTask\s*\(/u);
  assert.doesNotMatch(source, /if\s*\(\/failed to fetch\/i\.test\(errorText\)\)/u);
  assert.match(source, /加载 Session 失败：\$\{errorText\}/u);
});
