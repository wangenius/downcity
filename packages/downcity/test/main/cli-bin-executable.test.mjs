/**
 * CLI 入口可执行权限测试（node:test）。
 *
 * 关键点（中文）
 * - 构建产物里的 CLI 入口必须保留 shebang，并带有执行位。
 * - 这样 `npm link`、`npm install -g`、`npm pack` 后暴露出来的 `city` / `downcity`
 *   才能被 shell 直接执行。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const CLI_ENTRY = resolve(process.cwd(), "bin/main/commands/Index.js");

test("built cli entry keeps shebang and executable mode", () => {
  const content = readFileSync(CLI_ENTRY, "utf8");
  const stats = statSync(CLI_ENTRY);

  assert.equal(content.startsWith("#!/usr/bin/env node"), true);
  assert.notEqual(stats.mode & 0o111, 0);
});
