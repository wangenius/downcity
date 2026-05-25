/**
 * TaskPromptAssets：task service 静态提示词资产。
 *
 * 关键点（中文）
 * - task prompt 文本真实来源是 `PROMPT.ts.txt`。
 * - 这里统一做 `trim()`，保持 service system 文本行为稳定。
 */

import taskServicePromptText from "@/plugin/builtins/task/PROMPT.js";

/**
 * task service 固定 system prompt 文本。
 */
export const TASK_SERVICE_PROMPT = taskServicePromptText.trim();
