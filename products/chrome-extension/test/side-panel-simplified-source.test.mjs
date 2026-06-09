/**
 * Chrome 扩展 Side Panel 极简对话源码约束测试（node:test）。
 *
 * 关键点（中文）：
 * - Side Panel 主路径应是 RemoteAgent browser client，而不是暴露 SDK endpoint 细节。
 * - 当前页面必须跟随 Chrome 当前 tab 变化，并收进输入框区域。
 * - 侧边栏 UI 保持极简：左上 Agent 名，右上设置，不再展示独立 Current Page / Session 调试块。
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const SIDE_PANEL_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/side-panel/App.tsx";
const COMPOSER_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/side-panel/Composer.tsx";
const MARKDOWN_MESSAGE_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/side-panel/MarkdownMessage.tsx";
const API_TYPES_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/types/api.ts";
const REMOTE_AGENT_CLIENT_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/remoteAgentClient.ts";
const TAB_SERVICE_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/services/tab.ts";
const BACKGROUND_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/background.ts";
const PAGE_SELECTION_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/page-selection.ts";
const MANIFEST_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/public/manifest.json";
const VITE_CONFIG_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/vite.config.ts";
const TAILWIND_FILE =
  "/Users/wangenius/Documents/github/downcity/products/chrome-extension/src/styles/tailwind.css";

test("side panel uses simplified RemoteAgent chat surface with active tab context", () => {
  const sidePanelSource = readFileSync(SIDE_PANEL_FILE, "utf8");
  const composerSource = readFileSync(COMPOSER_FILE, "utf8");
  const markdownMessageSource = readFileSync(MARKDOWN_MESSAGE_FILE, "utf8");
  const apiTypesSource = readFileSync(API_TYPES_FILE, "utf8");
  const remoteAgentClientSource = readFileSync(REMOTE_AGENT_CLIENT_FILE, "utf8");
  const tabServiceSource = readFileSync(TAB_SERVICE_FILE, "utf8");
  const backgroundSource = readFileSync(BACKGROUND_FILE, "utf8");
  const pageSelectionSource = readFileSync(PAGE_SELECTION_FILE, "utf8");
  const manifestSource = readFileSync(MANIFEST_FILE, "utf8");
  const viteConfigSource = readFileSync(VITE_CONFIG_FILE, "utf8");
  const tailwindSource = readFileSync(TAILWIND_FILE, "utf8");

  assert.match(sidePanelSource, /createRemoteAgentClient/u);
  assert.match(sidePanelSource, /subscribeActiveTabContext/u);
  assert.match(sidePanelSource, /const\s+agentName\s*=\s*selectedAgent\?\.name/u);
  assert.match(sidePanelSource, /<SettingsIcon\s*\/>/u);
  assert.match(sidePanelSource, /<Composer/u);
  assert.match(sidePanelSource, /<MarkdownMessage/u);
  assert.match(sidePanelSource, /const\s+errorText\s*=/u);
  assert.match(sidePanelSource, /function\s+findLatestAssistantId/u);
  assert.match(sidePanelSource, /const\s+shouldShowLoadingDots\s*=/u);
  assert.match(sidePanelSource, /function\s+appendAssistantDelta/u);
  assert.match(sidePanelSource, /function\s+finalizeAssistantMessage/u);
  assert.match(sidePanelSource, /function\s+bindUserMessageTurn/u);
  assert.match(sidePanelSource, /function\s+placeAssistantAfterTurnUser/u);
  assert.match(sidePanelSource, /function\s+orderHistoryMessages/u);
  assert.match(sidePanelSource, /Array\.isArray\(item\.parts\)/u);
  assert.match(sidePanelSource, /function\s+normalizeMessageCreatedAt/u);
  assert.match(sidePanelSource, /function\s+stripCurrentContextBlock/u);
  assert.match(sidePanelSource, /function\s+stripLegacyFileBlocks/u);
  assert.match(sidePanelSource, /function\s+formatHistoryUserMessageText/u);
  assert.match(sidePanelSource, /<current_context>/u);
  assert.match(sidePanelSource, /<site title=/u);
  assert.match(sidePanelSource, /<selection label=/u);
  assert.match(sidePanelSource, /\(metadata as Record<string, unknown>\)\.ts/u);
  assert.match(sidePanelSource, /event\.type === "text-delta"/u);
  assert.match(sidePanelSource, /appendAssistantDelta\(/u);
  assert.match(sidePanelSource, /event\.type === "turn-finish"/u);
  assert.match(sidePanelSource, /finalizeAssistantMessage\(/u);
  assert.match(sidePanelSource, /const\s+turnId\s*=\s*await session\.prompt/u);
  assert.match(sidePanelSource, /bindUserMessageTurn\(\{/u);

  assert.doesNotMatch(sidePanelSource, /formatServerConnectionLabel/u);
  assert.doesNotMatch(sidePanelSource, />\s*Current Page\s*</u);
  assert.doesNotMatch(sidePanelSource, /Session:\s*\{/u);
  assert.doesNotMatch(sidePanelSource, /<file type="document"/u);
  assert.doesNotMatch(sidePanelSource, /<select[\s>]/u);
  assert.doesNotMatch(sidePanelSource, /<textarea/u);
  assert.doesNotMatch(sidePanelSource, /已附带/u);
  assert.doesNotMatch(sidePanelSource, /未附带/u);
  assert.doesNotMatch(sidePanelSource, /准备就绪/u);

  assert.match(composerSource, /contentEditable=\{!disabled\}/u);
  assert.match(composerSource, /node\.dataset\.composerReference = "true"/u);
  assert.match(composerSource, /data-composer-reference="true"/u);
  assert.match(composerSource, /function\s+createReferenceNode/u);
  assert.match(composerSource, /function\s+readReferences/u);
  assert.match(composerSource, /contentEditable = "false"/u);
  assert.match(composerSource, /data-placeholder="Ask anything\.\.\."/u);
  assert.match(composerSource, /pageReferenceFromTab/u);
  assert.match(composerSource, /downcity\.side-panel\.insert-selection-reference/u);
  assert.match(composerSource, /insertedSelectionIdsRef/u);
  assert.match(composerSource, /setAttribute\("aria-label", "删除引用"\)/u);
  assert.match(composerSource, /aria-label="发送"/u);
  assert.doesNotMatch(composerSource, /getActiveTabSelectionContext/u);
  assert.doesNotMatch(composerSource, /引用选中/u);
  assert.doesNotMatch(composerSource, /已附带/u);
  assert.doesNotMatch(composerSource, /未附带/u);
  assert.doesNotMatch(composerSource, /准备就绪/u);

  assert.match(markdownMessageSource, /import\s+\{\s*Streamdown\s*\}\s+from\s+"streamdown"/u);
  assert.match(markdownMessageSource, /parseIncompleteMarkdown/u);
  assert.match(markdownMessageSource, /isAnimating=\{props\.streaming === true\}/u);
  assert.match(apiTypesSource, /parts\?: unknown\[\]/u);
  assert.match(apiTypesSource, /metadata\?: unknown/u);
  assert.match(tailwindSource, /@import\s+"streamdown\/styles\.css"/u);
  assert.match(tailwindSource, /@source\s+"\.\.\/\.\.\/node_modules\/streamdown\/dist\/index\.js"/u);
  assert.match(tailwindSource, /\.side-panel-markdown/u);
  assert.match(tailwindSource, /overflow-wrap: anywhere/u);
  assert.match(tailwindSource, /white-space: pre-wrap/u);

  assert.match(remoteAgentClientSource, /export\s+function\s+createRemoteAgentClient/u);
  assert.match(remoteAgentClientSource, /getSession/u);
  assert.match(remoteAgentClientSource, /getAgentSdkSessionInfo/u);
  assert.match(remoteAgentClientSource, /isSessionNotFoundError/u);
  assert.match(remoteAgentClientSource, /prompt:\s*async/u);
  assert.match(remoteAgentClientSource, /subscribe:\s*async/u);

  assert.match(tabServiceSource, /export\s+function\s+subscribeActiveTabContext/u);
  assert.match(tabServiceSource, /chrome\.tabs\.onActivated\.addListener/u);
  assert.match(tabServiceSource, /chrome\.tabs\.onUpdated\.addListener/u);
  assert.match(tabServiceSource, /chrome\.windows\.onFocusChanged\.addListener/u);
  assert.doesNotMatch(tabServiceSource, /getActiveTabSelectionContext/u);

  assert.match(pageSelectionSource, /OVERLAY_ID/u);
  assert.match(pageSelectionSource, /getBoundingClientRect/u);
  assert.match(pageSelectionSource, /downcity\.page-selection\.reference/u);
  assert.match(pageSelectionSource, /document\.addEventListener\("selectionchange"/u);
  assert.match(backgroundSource, /pendingSelectionReference/u);
  assert.match(backgroundSource, /downcity\.page-selection\.reference/u);
  assert.match(backgroundSource, /downcity\.side-panel\.insert-selection-reference/u);
  assert.match(backgroundSource, /downcity\.side-panel\.ready/u);
  assert.match(manifestSource, /"content_scripts"/u);
  assert.match(manifestSource, /"assets\/page-selection\.js"/u);
  assert.match(viteConfigSource, /"page-selection"/u);
  assert.match(viteConfigSource, /assets\/page-selection\.js/u);
});
