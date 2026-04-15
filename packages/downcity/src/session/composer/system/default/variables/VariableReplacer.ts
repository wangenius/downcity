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
import {
  formatDateInTimezone,
  formatDateTimeInTimezone,
  formatYearInTimezone,
  resolveRuntimeTimezone,
} from "@/shared/utils/Time.js";

/**
 * Prompt 变量替换模式。
 *
 * 关键点（中文）
 * - `full`：完整替换（包含时间/地点等上下文动态变量）。
 * - `stable`：仅保留稳定替换；但 `current_year` 属于低频年度变量，仍保留真实值。
 */
export type PromptVariableMode = "full" | "stable";

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
  const safeLocalTimezone = resolveRuntimeTimezone();
  const now = new Date();
  if (mode === "stable") {
    return {
      currentDate: "[See runtime clock tail message]",
      currentTime: "[See runtime clock tail message]",
      currentYear: formatYearInTimezone(now, safeLocalTimezone),
      timezone: safeLocalTimezone,
      location: "[See runtime clock tail message]",
      projectPath,
      projectRoot: projectPath,
      sessionId: "[Runtime session id]",
    };
  }

  const geo = await resolvePromptGeoContext();
  const sessionId = String(options?.sessionId || "").trim() || "unknown";
  return {
    // 关键点（中文）：时间字段只使用本机 runtime 时区，避免代理/IP 地理推断改变 cron 与相对时间口径。
    currentDate: formatDateInTimezone(now, safeLocalTimezone),
    currentTime: formatDateTimeInTimezone(now, safeLocalTimezone),
    currentYear: formatYearInTimezone(now, safeLocalTimezone),
    timezone: safeLocalTimezone,
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
 * - `{{current_date}}`
 * - `{{current_year}}`
 * - `{{timezone}}`
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
    current_date: variables.currentDate,
    current_time: variables.currentTime,
    current_year: variables.currentYear,
    timezone: variables.timezone,
    location: variables.location,
    project_path: variables.projectPath,
    project_root: variables.projectRoot,
    session_id: variables.sessionId,
  });
}

/**
 * 构建每轮运行末尾的 runtime clock system prompt。
 *
 * 关键点（中文）
 * - system/static prompt 使用 stable 模式，不能直接承载每轮变化的时间。
 * - 这里在 messages 尾部补齐 `current_date/current_time/timezone`，让 chat、task、prompt 的时间语义统一。
 * - 只使用本机 runtime 时区，避免每轮为了地理位置进行网络请求。
 */
export function buildRuntimeClockSystemPrompt(options?: {
  /**
   * 项目路径（用于 `project_root`）。
   */
  projectPath?: string;

  /**
   * 会话 ID（用于 `session_id`）。
   */
  sessionId?: string;
}): string {
  const timezone = resolveRuntimeTimezone();
  const projectPath = String(options?.projectPath || "").trim() || process.cwd();
  const sessionId = String(options?.sessionId || "").trim() || "unknown";
  const now = new Date();
  return [
    "# Runtime Clock Context",
    "以下字段是本轮运行的权威时间上下文；解析“今天/明天/几点”等相对时间时优先使用它们：",
    `- current_date: ${formatDateInTimezone(now, timezone)}`,
    `- current_time: ${formatDateTimeInTimezone(now, timezone)}`,
    `- timezone: ${timezone}`,
    `- session_id: ${sessionId}`,
    `- project_root: ${projectPath}`,
  ].join("\n");
}
