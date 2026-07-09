/**
 * SystemPromptAssets：system 域静态提示词资产。
 *
 * 关键点（中文）
 * - prompt 文本真实来源是 `*.ts.txt`，build 时自动生成对应 TS 模块。
 * - 这里负责统一做 `trim()`，保证运行时行为稳定。
 */

import coreSystemPromptText from "@executor/composer/system/default/assets/core.prompt.js";
import taskSystemPromptText from "@executor/composer/system/default/assets/task.prompt.js";

/**
 * 默认 core system prompt。
 */
export const CORE_SYSTEM_PROMPT = coreSystemPromptText.trim();

/**
 * task 模式专用 system prompt。
 */
export const TASK_SYSTEM_PROMPT = taskSystemPromptText.trim();
