/**
 * Agent prompt helpers.
 *
 * 这里主要做两件事：
 * 1) 生成每次请求的“运行时 system prompt”（包含 contextId/requestId/来源渠道等）
 * 2) 把 `PROFILE.md` / `SOUL.md` / `USER.md` / 内置 prompts / skills 概览等“瓶装 system prompts”统一转换为 system messages，
 *    并支持模板变量替换（例如 `{{current_time}}`）
 */

import fs from "node:fs";
import { SystemModelMessage } from "ai";
import { resolvePromptGeoContext } from "@main/prompts/runtime/GeoContext.js";
import type { PromptTemplateVariables } from "@main/prompts/types/PromptVariables.js";
import { renderTemplateVariables } from "@/utils/Template.js";

/**
 * 构建一次运行的运行时 system prompt。
 *
 * 关键点（中文）
 * - 注入 project/context/request 等请求级上下文。
 * - 与固定规则拼接，形成每次调用的最小安全边界。
 */
export function buildContextSystemPrompt(input: {
  projectRoot: string;
  contextId: string;
  requestId: string;
  mode?: "chat" | "task";
  extraContextLines?: string[];
}): string {
  const { projectRoot, contextId, requestId, extraContextLines } = input;
  const mode = input.mode === "task" ? "task" : "chat";
  if (mode === "chat") return "";

  const runtimeContextLines: string[] = [
    "Runtime context:",
    `- Project root: ${projectRoot}`,
    `- ContextId: ${contextId}`,
    `- Request ID: ${requestId}`,
  ];

  if (Array.isArray(extraContextLines) && extraContextLines.length > 0) {
    runtimeContextLines.push(...extraContextLines);
  }

  const outputRules = [
    "Task-run output rules:",
    "- This is a task execution context, not an interactive chat turn.",
    "- Do NOT send external channel messages via `sma chat send` unless explicitly required by the task itself.",
    "- Reply with result-oriented content; do NOT paste raw tool outputs or JSON logs.",
    "- Keep output compact and avoid unnecessary conversational fillers.",
  ].join("\n");

  return [runtimeContextLines.join("\n"), "", outputRules].join("\n");
}

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

async function buildPromptTemplateVariables(options?: {
  projectPath?: string;
  contextId?: string;
  requestId?: string;
}): Promise<PromptTemplateVariables> {
  const geo = await resolvePromptGeoContext();
  const projectPath = String(options?.projectPath || "").trim() || process.cwd();
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
    projectPath?: string;
    contextId?: string;
    requestId?: string;
  },
): Promise<string> {
  if (!prompt) return prompt;
  const variables = await buildPromptTemplateVariables(options);
  return renderTemplateVariables(prompt, {
    current_time: variables.currentTime,
    location: variables.location,
    project_path: variables.projectPath,
    project_root: variables.projectRoot,
    context_id: variables.contextId,
    request_id: variables.requestId,
  });
}

/**
 * 将纯文本 prompts 转为 `system` messages。
 *
 * - 自动过滤空串并执行变量替换。
 */
export async function transformPromptsIntoSystemMessages(
  prompts: string[],
  options?: {
    projectPath?: string;
    contextId?: string;
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

/**
 * 解析静态 system prompts。
 *
 * 关键点（中文）
 * - task 执行上下文可替换默认 core prompt（`DEFAULT_SHIP_PROMPTS`）为任务专用提示词。
 * - PROFILE/SOUL/USER 等其他静态提示保持不变。
 */
export function resolveStaticSystemPrompts(input: {
  systems: string[];
  replaceDefaultCorePrompt?: string;
}): string[] {
  const base = Array.isArray(input.systems) ? [...input.systems] : [];
  const replacement = String(input.replaceDefaultCorePrompt || "").trim();
  if (!replacement) return base;
  return [...base.filter((item) => item !== DEFAULT_SHIP_PROMPTS), replacement];
}

/**
 * 统一构建一次 Agent 运行所需的 system messages。
 *
 * 关键点（中文）
 * - runtime/static/service 的组装逻辑统一收敛在 main/prompts。
 * - 上层传入静态与服务提示文本，core 仅消费最终 system messages。
 */
export async function buildAgentSystemMessages(input: {
  projectRoot: string;
  contextId: string;
  requestId: string;
  mode?: "chat" | "task";
  replaceDefaultCorePrompt?: string;
  staticSystemPrompts: string[];
  serviceSystemPrompts: string[];
}): Promise<SystemModelMessage[]> {
  const runtimeSystemText = buildContextSystemPrompt({
    projectRoot: input.projectRoot,
    contextId: input.contextId,
    requestId: input.requestId,
    mode: input.mode,
  });
  const runtimeSystemMessages: SystemModelMessage[] = runtimeSystemText
    ? [{ role: "system", content: runtimeSystemText }]
    : [];
  const staticSystemMessages = await transformPromptsIntoSystemMessages(
    resolveStaticSystemPrompts({
      systems: input.staticSystemPrompts,
      replaceDefaultCorePrompt: input.replaceDefaultCorePrompt,
    }),
    {
      projectPath: input.projectRoot,
      contextId: input.contextId,
      requestId: input.requestId,
    },
  );
  const serviceSystemMessages = await transformPromptsIntoSystemMessages(
    Array.isArray(input.serviceSystemPrompts) ? input.serviceSystemPrompts : [],
    {
      projectPath: input.projectRoot,
      contextId: input.contextId,
      requestId: input.requestId,
    },
  );
  return [
    ...runtimeSystemMessages,
    ...staticSystemMessages,
    ...serviceSystemMessages,
  ];
}

/**
 * 加载 Ship 默认系统提示模板（txt 文件）。
 *
 * 关键点（中文）
 * - 默认提示词落在独立 txt，便于直接维护长文本。
 * - 启动时若文件缺失，直接抛错，避免在生产中静默降级。
 */
const DEFAULT_SHIP_PROMPTS_FILE_URL = new URL(
  "./prompt.txt",
  import.meta.url,
);

function loadDefaultShipPrompts(): string {
  try {
    return fs.readFileSync(DEFAULT_SHIP_PROMPTS_FILE_URL, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load default ship prompts from ${DEFAULT_SHIP_PROMPTS_FILE_URL.pathname}: ${reason}`,
    );
  }
}

/**
 * Ship 默认系统提示模板。
 */
export const DEFAULT_SHIP_PROMPTS = loadDefaultShipPrompts();
