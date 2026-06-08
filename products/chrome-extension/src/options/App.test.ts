/**
 * Options 设置页极简结构测试。
 *
 * 关键点（中文）：
 * - 设置页只向用户暴露 Downcity Town、Agent、Default Ask 三个主概念。
 * - 旧的连接拆分字段与路由模式不再出现在设置页主路径。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OPTIONS_APP_FILE_PATH =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/options/App.tsx";

test("Options App exposes a minimal Downcity Town configuration", () => {
  const source = readFileSync(OPTIONS_APP_FILE_PATH, "utf8");

  assert.match(source, /Downcity Town/u);
  assert.match(source, /Town URL/u);
  assert.match(source, /Agent/u);
  assert.match(source, /Default Ask/u);
  assert.match(source, /保存并检查/u);
  assert.match(source, /http:\/\/127\.0\.0\.1:5314/u);

  assert.doesNotMatch(source, /Server Connections/u);
  assert.doesNotMatch(source, /Connection Name/u);
  assert.doesNotMatch(source, /Default Routing/u);
  assert.doesNotMatch(source, /Default Session/u);
  assert.doesNotMatch(source, /Connect Console/u);
  assert.doesNotMatch(source, /IM Forward/u);
  assert.doesNotMatch(source, /Agent \/ Channel/u);
  assert.doesNotMatch(source, /Channel Chat/u);
});
