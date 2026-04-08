/**
 * VariableReplacer：prompt 变量替换模块。
 *
 * 关键点（中文）
 * - 专职负责模板变量构建与文本替换。
 * - 与 message 组装解耦，便于独立复用与测试。
 */

import { resolvePromptGeoContext } from "@session/composer/system/default/variables/GeoContext.js";
import type { PromptVariables } from "@session/composer/system/default/variables/PromptTypes.js";
import { renderTemplateVariables } from "@/shared/utils/Template.js";

/**
 * Prompt 变量替换模式。
 *
 * 关键点（中文）
 * - `full`：完整替换（包含时间/地点等上下文动态变量）。
 * - `stable`：仅保留稳定替换；但 `current_year` 属于低频年度变量，仍保留真实值。
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

/**
 * 获取当前年份字符串（指定时区）。
 */
function getCurrentYearString(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
    }).format(new Date());
  } catch {
    return String(new Date().getUTCFullYear());
  }
}

async function buildPromptVariables(options?: {
  /**
   * 项目路径（用于 `project_path/project_root`）。
   */
  projectPath?: string;

  /**
   * 会话 ID（用于 `session_id`）。
   */
  sessionId?: string;

  /**
   * 变量替换模式（默认 full）。
   */
  mode?: PromptVariableMode;
}): Promise<PromptVariables> {
  const mode = options?.mode === "stable" ? "stable" : "full";
  const projectPath = String(options?.projectPath || "").trim() || process.cwd();
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const safeLocalTimezone = String(localTimezone || "").trim() || "UTC";
  if (mode === "stable") {
    return {
      currentTime: "[See runtime clock tail message]",
      currentYear: getCurrentYearString(safeLocalTimezone),
      location: "[See runtime clock tail message]",
      projectPath,
      projectRoot: projectPath,
      sessionId: "[Runtime session id]",
    };
  }

  const geo = await resolvePromptGeoContext();
  const sessionId = String(options?.sessionId || "").trim() || "unknown";
  return {
    currentTime: getCurrentTimeString(geo.timezone),
    currentYear: getCurrentYearString(geo.timezone),
    location: geo.location,
    projectPath,
    projectRoot: projectPath,
    sessionId,
  };
}

/**
 * 替换 prompt 模板变量。
 *
 * 当前支持（中文）
 * - `{{current_time}}`
 * - `{{current_year}}`
 * - `{{location}}`
 * - `{{project_path}}`
 * - `{{project_root}}`
 * - `{{session_id}}`
 */
export async function replaceVariablesInPrompts(
  prompt: string,
  options?: {
    /**
     * 项目路径（用于 `project_path/project_root`）。
     */
    projectPath?: string;

    /**
     * 会话 ID（用于 `session_id`）。
     */
    sessionId?: string;

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
    current_year: variables.currentYear,
    location: variables.location,
    project_path: variables.projectPath,
    project_root: variables.projectRoot,
    session_id: variables.sessionId,
  });
}
