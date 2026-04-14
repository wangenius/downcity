/**
 * Chrome 扩展鉴权错误源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - Console 返回 `auth required` 时，扩展必须提示用户去设置页补 Bearer Token。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const AUTH_HELPER_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/auth.ts";
const INLINE_HELPER_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/inline-composer/helpers.ts";

test("extension treats auth required as token configuration failure", () => {
  const authSource = readFileSync(AUTH_HELPER_FILE, "utf8");
  const inlineSource = readFileSync(INLINE_HELPER_FILE, "utf8");

  assert.match(authSource, /auth required/u);
  assert.match(inlineSource, /auth required/u);
  assert.match(authSource, /请在扩展设置页填写 Bearer Token/u);
  assert.match(inlineSource, /请在扩展设置页填写 Bearer Token/u);
});
