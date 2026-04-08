/**
 * Chrome 扩展直答模式源码约束测试（node:test）。
 *
 * 关键点（中文）
 * - 设置页应提供 Inline Composer 使用的默认模型选择。
 * - Popup 不应承担直答入口，Inline Composer 才承接模型直答。
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

  assert.match(source, /Default Model/u);
  assert.match(source, /Inline Composer/u);
  assert.doesNotMatch(source, /Reply Mode/u);
});

test("inline composer supports model reply and agent dispatch while popup stays dispatch-only", () => {
  const popupSource = readFileSync(POPUP_APP_FILE, "utf8");
  const inlineSource = readFileSync(INLINE_COMPOSER_UI_FILE, "utf8");
  const apiSource = readFileSync(API_FILE, "utf8");

  assert.match(apiSource, /inferModel/u);
  assert.match(inlineSource, /inferInlineComposerModel/u);
  assert.match(inlineSource, /sendPageContextToAgent/u);
  assert.match(inlineSource, /inlineMode/u);
  assert.match(inlineSource, /直答/u);
  assert.doesNotMatch(popupSource, /inferModel/u);
});
