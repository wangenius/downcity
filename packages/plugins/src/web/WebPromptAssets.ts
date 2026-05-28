/**
 * WebPromptAssets：web plugin 静态提示词资产。
 *
 * 关键点（中文）
 * - prompt 文本真实来源是 `*.ts.txt` 文本文件。
 * - `agent-browser` prompt 仍会被安装流程复用为默认 SKILL.md 内容。
 */

import agentBrowserPromptText from "@/web/PROMPT.agent-browser.js";
import webPluginPromptText from "@/web/PROMPT.js";
import webAccessPromptText from "@/web/PROMPT.web-access.js";

/**
 * web plugin 基础 prompt。
 */
export const WEB_PLUGIN_PROMPT = webPluginPromptText.trim();

/**
 * web-access provider prompt。
 */
export const WEB_ACCESS_PROMPT = webAccessPromptText.trim();

/**
 * agent-browser provider prompt。
 */
export const AGENT_BROWSER_PROMPT = agentBrowserPromptText.trim();
