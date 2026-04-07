/**
 * Extension Popup 头部操作按钮测试。
 *
 * 关键点（中文）：
 * - 用户明确否定 icon 方案后，头部操作区应回到纯文字按钮。
 * - 纯文字控件要避免依赖额外图标模块，保证界面更克制、可读性更直接。
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const APP_FILE_PATH =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/extension-popup/App.tsx";
const ICON_FILE_PATH =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/extension-popup/PopupIcons.tsx";

test("ExtensionPopupApp uses text-only controls for header actions", () => {
  const appSource = readFileSync(APP_FILE_PATH, "utf8");

  assert.doesNotMatch(appSource, /from\s+"\.\/PopupIcons"/u);
  assert.match(appSource, />\s*上一位\s*</u);
  assert.match(appSource, />\s*下一位\s*</u);
  assert.match(appSource, />\s*设置\s*</u);
  assert.equal(existsSync(ICON_FILE_PATH), false);
});
