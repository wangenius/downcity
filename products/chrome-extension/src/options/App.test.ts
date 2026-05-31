/**
 * Options 设置页结构测试。
 *
 * 关键点（中文）：
 * - 设置页应先暴露多连接管理，再暴露鉴权与默认路由。
 * - 用户可见命名应统一使用 Server / Session，不再出现旧的 Console / Channel Chat 文案。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OPTIONS_APP_FILE_PATH =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/options/App.tsx";

test("Options App exposes server connections before auth and default routing", () => {
  const source = readFileSync(OPTIONS_APP_FILE_PATH, "utf8");

  const connectionIndex = source.indexOf("Server Connections");
  const authIndex = source.indexOf("Authentication");
  const routingIndex = source.indexOf("Default Routing");

  assert.notEqual(connectionIndex, -1);
  assert.notEqual(authIndex, -1);
  assert.notEqual(routingIndex, -1);
  assert.ok(connectionIndex < authIndex);
  assert.ok(authIndex < routingIndex);

  assert.match(source, /Connection Name/u);
  assert.match(source, /Protocol/u);
  assert.match(source, /Host/u);
  assert.match(source, /Port/u);
  assert.match(source, /Base Path/u);
  assert.match(source, /Bearer Token/u);
  assert.match(source, /town token create my-token/u);
  assert.match(source, /Default Session/u);
  assert.doesNotMatch(source, /Connect Console/u);
  assert.doesNotMatch(source, /Agent \/ Channel/u);
  assert.doesNotMatch(source, /Channel Chat/u);
});
