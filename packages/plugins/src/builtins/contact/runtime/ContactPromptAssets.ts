/**
 * ContactPromptAssets：contact plugin runtime 静态提示词资产。
 *
 * 关键点（中文）
 * - contact prompt 文本真实来源是 `PROMPT.ts.txt`。
 * - 这里统一做 `trim()`，避免运行时行为漂移。
 */

import contactPromptText from "@/builtins/contact/PROMPT.js";

/**
 * contact plugin runtime system prompt。
 */
export const CONTACT_SERVICE_PROMPT = contactPromptText.trim();
