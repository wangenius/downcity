/**
 * Options 设置页结构测试。
 *
 * 关键点（中文）：
 * - Server 地址与鉴权属于同一组连接配置，不能拆成两个孤立 section。
 * - Agent / Channel 选择必须放在连接配置之后，避免用户先看见结果路由，再去补底层连接。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OPTIONS_APP_FILE_PATH =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/options/App.tsx";

test("Options App groups server and auth above agent and channel selection", () => {
  const source = readFileSync(OPTIONS_APP_FILE_PATH, "utf8");

  const serverAuthIndex = source.indexOf("Connect Console");
  const agentChannelIndex = source.indexOf("Agent / Channel");

  assert.notEqual(serverAuthIndex, -1);
  assert.notEqual(agentChannelIndex, -1);
  assert.ok(serverAuthIndex < agentChannelIndex);

  assert.match(source, />\s*IP \/ Host\s*</u);
  assert.match(source, />\s*Port\s*</u);
  assert.match(source, />\s*Access Token\s*</u);
  assert.doesNotMatch(source, />\s*Connection\s*</u);
  assert.doesNotMatch(source, />\s*Server \/ Auth\s*</u);
});
