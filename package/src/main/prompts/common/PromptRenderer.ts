/**
 * PromptRenderer：system prompt 消息渲染器。
 *
 * 关键点（中文）
 * - 负责文本 prompt -> system message 的转换能力。
 * - 变量替换下沉到 `prompts/variables/VariableReplacer`。
 * - 不关注具体 prompt 来源（静态/服务/运行时）。
 */

import { type SystemModelMessage } from "ai";
import { replaceVariablesInPrompts } from "@main/prompts/variables/VariableReplacer.js";

/**
 * 将纯文本 prompts 转为 `system` messages。
 *
 * 关键点（中文）
 * - 自动过滤空串并执行变量替换。
 */
export async function transformPromptsIntoSystemMessages(
  prompts: string[],
  options?: {
    /**
     * 项目路径（用于模板变量）。
     */
    projectPath?: string;

    /**
     * 会话 ID（用于模板变量）。
     */
    contextId?: string;

    /**
     * 请求 ID（用于模板变量）。
     */
    requestId?: string;
  },
): Promise<SystemModelMessage[]> {
  const nonEmptyPrompts = prompts.filter((item) => item.length > 0);
  return Promise.all(
    nonEmptyPrompts.map(async (item) => ({
      role: "system" as const,
      content: await replaceVariablesInPrompts(item, options),
    })),
  );
}
