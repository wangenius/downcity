/**
 * WebPromptAssets：web plugin 静态提示词资产。
 *
 * 关键点（中文）
 * - prompt 文本真实来源是 `*.ts.txt` 文本文件。
 * - web plugin 只保留通用联网方法论，不再维护 provider 专属提示词。
 */

import webPluginPromptText from "@/web/PROMPT.js";

/**
 * web plugin 基础 prompt。
 */
export const WEB_PLUGIN_PROMPT = webPluginPromptText.trim();
