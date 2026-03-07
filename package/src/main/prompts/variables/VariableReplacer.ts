/**
 * VariableReplacer：prompt 变量替换模块。
 *
 * 关键点（中文）
 * - 专职负责模板变量构建与文本替换。
 * - 与 message 组装解耦，便于独立复用与测试。
 */

import { resolvePromptGeoContext } from "@main/prompts/variables/GeoContext.js";
import type { PromptVariables } from "@main/prompts/variables/PromptTypes.js";
import { renderTemplateVariables } from "@/utils/Template.js";

/**
 * Prompt 变量替换模式。
 *
 * 关键点（中文）
 * - `full`：完整替换（包含时间/地点/上下文动态变量）。
 * - `stable`：仅保留稳定替换，易变变量统一替换为稳定文本，提升缓存命中率。
 */
export type PromptVariableMode = "full" | "stable";

/**
 * 获取当前时间字符串（指定时区）。
 */
function getCurrentTimeString(timezone: string): string {
  try {
    // 关键点（中文）：使用固定格式，确保模型读取时区信息时稳定。
    const formatted = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .format(new Date())
      .replace(" ", "T");
    return `${formatted} (${timezone})`;
  } catch {
    return new Date().toISOString();
  }
}

async function buildPromptVariables(options?: {
  /**
   * 项目路径（用于 `project_path/project_root`）。
   */
  projectPath?: string;

  /**
   * 会话 ID（用于 `context_id`）。
   */
  contextId?: string;

  /**
   * 请求 ID（用于 `request_id`）。
   */
  requestId?: string;

  /**
   * 变量替换模式（默认 full）。
   */
  mode?: PromptVariableMode;
}): Promise<PromptVariables> {
  const mode = options?.mode === "stable" ? "stable" : "full";
  const projectPath = String(options?.projectPath || "").trim() || process.cwd();
  if (mode === "stable") {
    return {
      currentTime: "[See runtime clock tail message]",
      location: "[See runtime clock tail message]",
      projectPath,
      projectRoot: projectPath,
      contextId: "[Runtime context id]",
      requestId: "[Runtime request id]",
    };
  }

  const geo = await resolvePromptGeoContext();
  const contextId = String(options?.contextId || "").trim() || "unknown";
  const requestId = String(options?.requestId || "").trim() || "unknown";
  return {
    currentTime: getCurrentTimeString(geo.timezone),
    location: geo.location,
    projectPath,
    projectRoot: projectPath,
    contextId,
    requestId,
  };
}

/**
 * 替换 prompt 模板变量。
 *
 * 当前支持（中文）
 * - `{{current_time}}`
 * - `{{location}}`
 * - `{{project_path}}`
 * - `{{project_root}}`
 * - `{{context_id}}`
 * - `{{request_id}}`
 */
export async function replaceVariablesInPrompts(
  prompt: string,
  options?: {
    /**
     * 项目路径（用于 `project_path/project_root`）。
     */
    projectPath?: string;

    /**
     * 会话 ID（用于 `context_id`）。
     */
    contextId?: string;

    /**
     * 请求 ID（用于 `request_id`）。
     */
    requestId?: string;

    /**
     * 变量替换模式（默认 full）。
     */
    mode?: PromptVariableMode;
  },
): Promise<string> {
  if (!prompt) return prompt;
  const variables = await buildPromptVariables(options);
  return renderTemplateVariables(prompt, {
    current_time: variables.currentTime,
    location: variables.location,
    project_path: variables.projectPath,
    project_root: variables.projectRoot,
    context_id: variables.contextId,
    request_id: variables.requestId,
  });
}
