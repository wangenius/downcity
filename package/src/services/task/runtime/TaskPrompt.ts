/**
 * Task 执行专用系统提示词加载。
 *
 * 关键点（中文）
 * - task 执行（executor / user-simulator）不应复用 chat 对话提示词。
 * - 这里加载 `TASK.prompt.txt`，供 Agent 在 task 上下文替换默认 prompt。
 */

import { readFileSync } from "node:fs";

const TASK_AGENT_PROMPT_FILE_URL = new URL("../TASK.prompt.txt", import.meta.url);

function loadTaskAgentPrompt(): string {
  try {
    return readFileSync(TASK_AGENT_PROMPT_FILE_URL, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load task agent prompt from ${TASK_AGENT_PROMPT_FILE_URL.pathname}: ${reason}`,
    );
  }
}

/**
 * Task 执行专用系统提示词。
 */
export const TASK_AGENT_SYSTEM_PROMPT = loadTaskAgentPrompt();
