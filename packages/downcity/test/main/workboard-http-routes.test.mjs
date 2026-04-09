/**
 * Workboard runtime 接入回归测试（node:test）。
 *
 * 关键点（中文）
 * - workboard 必须注册为内建 plugin。
 * - runtime server 必须装配 plugin HTTP 注入能力。
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pluginsPath = path.resolve(
  import.meta.dirname,
  "../../src/main/plugin/Plugins.ts",
);
const serverPath = path.resolve(
  import.meta.dirname,
  "../../src/main/modules/http/Server.ts",
);

test("builtin plugins should register workboard plugin", () => {
  const source = fs.readFileSync(pluginsPath, "utf-8");

  assert.match(source, /workboardPlugin/);
});

test("agent runtime server should register builtin plugin http routes", () => {
  const source = fs.readFileSync(serverPath, "utf-8");

  assert.match(source, /registerBuiltinPluginHttpRoutes/);
});
