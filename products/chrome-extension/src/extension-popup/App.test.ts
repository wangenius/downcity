/**
 * Extension Popup 头部操作按钮测试。
 *
 * 关键点（中文）：
 * - 头部操作按钮必须使用统一的 SVG icon button，而不是依赖字符图标。
 * - 这样可以稳定控制视觉尺寸、描边粗细和 hover 反馈，避免 popup 中图标显小且风格松散。
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const APP_FILE_PATH =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/extension-popup/App.tsx";
const ICON_FILE_PATH =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/extension-popup/PopupIcons.tsx";

test("ExtensionPopupApp uses dedicated SVG icons instead of tiny text glyphs", () => {
  const appSource = readFileSync(APP_FILE_PATH, "utf8");

  assert.doesNotMatch(appSource, />\s*‹\s*</u);
  assert.doesNotMatch(appSource, />\s*›\s*</u);
  assert.doesNotMatch(appSource, />\s*⚙\s*</u);

  assert.equal(existsSync(ICON_FILE_PATH), true);
  const iconSource = readFileSync(ICON_FILE_PATH, "utf8");
  assert.match(iconSource, /<svg[\s\S]*viewBox=/u);
});
