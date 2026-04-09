/**
 * Chrome 扩展 Inline Composer 模式源码约束测试（node:test）。
 *
 * 关键点（中文）
 * - 设置页应提供频道模式 / 即时模式与即时 executor 的默认设置。
 * - Popup 不应承担即时模式入口，Inline Composer 才承接即时执行。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const OPTIONS_APP_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/options/App.tsx";
const POPUP_APP_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/extension-popup/App.tsx";
const INLINE_COMPOSER_UI_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/inline-composer/ui.ts";
const API_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/downcityApi.ts";

test("options app exposes inline composer model selection without popup reply mode", () => {
  const source = readFileSync(OPTIONS_APP_FILE, "utf8");

  assert.match(source, /Default Mode/u);
  assert.match(source, /Default Instant Executor/u);
  assert.match(source, /Inline Composer/u);
  assert.doesNotMatch(source, /Reply Mode/u);
});

test("inline composer supports instant mode and channel mode while popup stays dispatch-only", () => {
  const popupSource = readFileSync(POPUP_APP_FILE, "utf8");
  const inlineSource = readFileSync(INLINE_COMPOSER_UI_FILE, "utf8");
  const apiSource = readFileSync(API_FILE, "utf8");

  assert.match(inlineSource, /runInlineInstant/u);
  assert.match(inlineSource, /sendPageContextToAgent/u);
  assert.match(inlineSource, /instantExecutor/u);
  assert.match(inlineSource, /即时模式/u);
  assert.doesNotMatch(apiSource, /inferModel/u);
  assert.doesNotMatch(popupSource, /runInlineInstant/u);
});
