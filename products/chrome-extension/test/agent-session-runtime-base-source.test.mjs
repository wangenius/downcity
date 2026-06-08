/**
 * Chrome 扩展 Agent Session 连接源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - `/api/ui/agents` 走 Server Connection。
 * - `/api/sdk/*` 走选中 Agent 返回的 runtime baseUrl。
 * - 防止把 Console / Town 聚合地址误用成单 Agent SDK 地址，导致 Side Panel 无法联通。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const POPUP_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/extension-popup/App.tsx";
const SIDE_PANEL_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/side-panel/App.tsx";
const SERVER_CONNECTION_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/serverConnection.ts";

test("agent session sdk calls use selected agent runtime base url", () => {
  const popupSource = readFileSync(POPUP_FILE, "utf8");
  const sidePanelSource = readFileSync(SIDE_PANEL_FILE, "utf8");
  const serverConnectionSource = readFileSync(SERVER_CONNECTION_FILE, "utf8");

  assert.match(serverConnectionSource, /export\s+function\s+resolveAgentRuntimeBaseUrl/u);
  assert.match(serverConnectionSource, /params\.agent\?\.baseUrl/u);
  assert.match(popupSource, /const\s+agentRuntimeBaseUrl\s*=\s*useMemo/u);
  assert.match(popupSource, /serverBaseUrl:\s*agentRuntimeBaseUrl/u);
  assert.match(sidePanelSource, /const\s+agentRuntimeBaseUrl\s*=\s*useMemo/u);
  assert.match(sidePanelSource, /resolveAgentRuntimeBaseUrl\(\{\s*agent:\s*nextAgent/u);
  assert.match(sidePanelSource, /serverBaseUrl:\s*agentRuntimeBaseUrl/u);
});
