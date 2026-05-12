/**
 * TaskServiceSystem：task service 的 system prompt 模块。
 *
 * 关键点（中文）
 * - task service prompt 属于静态资产。
 * - 在模块初始化时读取，确保运行时行为稳定且可预期。
 */

import { readFileSync } from "node:fs";

const TASK_PROMPT_FILE_URL = new URL("../PROMPT.txt", import.meta.url);

/**
 * 加载 task service 使用说明提示词。
 */
function loadTaskServicePrompt(): string {
  try {
    return readFileSync(TASK_PROMPT_FILE_URL, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load task service prompt from ${TASK_PROMPT_FILE_URL.pathname}: ${reason}`,
    );
  }
}

/**
 * task service 固定 system prompt 文本。
 */
export const TASK_SERVICE_PROMPT = loadTaskServicePrompt();
