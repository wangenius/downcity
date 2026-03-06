/**
 * SystemDomain：system 领域统一实现。
 *
 * 关键点（中文）
 * - 收敛 system 的资产加载、上下文档位判定、service prompt 收集、messages 组装。
 * - `PromptSystemer` 只做组件适配；核心逻辑统一在本文件。
 */

import fs from "fs-extra";
import type { SystemModelMessage } from "ai";
import { transformPromptsIntoSystemMessages } from "@main/prompts/common/PromptRenderer.js";
import { SERVICES } from "@main/service/Services.js";
import type { ServiceRuntime } from "@main/service/ServiceRuntime.js";
import { buildMemorySystemText } from "@services/memory/runtime/SystemProvider.js";

const CORE_PROMPT_FILE_URL = new URL("./assets/core.prompt.txt", import.meta.url);
const SERVICE_PROMPT_FILE_URL = new URL(
  "./assets/service.prompt.txt",
  import.meta.url,
);
const TASK_PROMPT_FILE_URL = new URL("./assets/task.prompt.txt", import.meta.url);

const DEFAULT_DISABLED_SERVICE_NAMES: string[] = [];

function normalizeSystemText(input: string | null | undefined): string {
  return String(input || "").trim();
}

/**
 * 从 system 资产读取 prompt 文本。
 */
function loadSystemPromptAsset(fileUrl: URL, label: string): string {
  try {
    return fs.readFileSync(fileUrl, "utf-8").trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to load ${label} from ${fileUrl.pathname}: ${reason}`,
    );
  }
}

/**
 * Ship 默认系统提示模板。
 */
export const DEFAULT_SHIP_PROMPTS = loadSystemPromptAsset(
  CORE_PROMPT_FILE_URL,
  "core system prompt",
);

const MAIN_SERVICE_PROMPT = loadSystemPromptAsset(
  SERVICE_PROMPT_FILE_URL,
  "service system prompt",
);
const TASK_SYSTEM_PROMPT = loadSystemPromptAsset(
  TASK_PROMPT_FILE_URL,
  "task system prompt",
);

/**
 * 构建一次运行的运行时 system prompt。
 *
 * 关键点（中文）
 * - 注入 project/context/request 等请求级上下文。
 * - task 模式下追加输出规则；chat 模式为空。
 */
export function buildContextSystemPrompt(input: {
  /**
   * 项目根目录。
   */
  projectRoot: string;

  /**
   * 当前会话 ID。
   */
  contextId: string;

  /**
   * 当前请求 ID。
   */
  requestId: string;

  /**
   * 当前 system 模式（默认 chat）。
   */
  mode?: "chat" | "task";

  /**
   * 额外上下文行（可选）。
   */
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
 * 解析静态 system prompts。
 *
 * 关键点（中文）
 * - task 执行上下文可替换默认 core prompt（`DEFAULT_SHIP_PROMPTS`）为任务专用提示词。
 * - PROFILE/SOUL/USER 等其他静态提示保持不变。
 */
export function resolveStaticSystemPrompts(input: {
  /**
   * 当前静态 system 文本集合。
   */
  systems: string[];

  /**
   * 可选默认 core prompt 替换文本（task 场景常用）。
   */
  replaceDefaultCorePrompt?: string;
}): string[] {
  const base = Array.isArray(input.systems) ? [...input.systems] : [];
  const replacement = String(input.replaceDefaultCorePrompt || "").trim();
  if (!replacement) return base;
  return [...base.filter((item) => item !== DEFAULT_SHIP_PROMPTS), replacement];
}

type ResolvedSystemContextProfile = {
  mode: "chat" | "task";
  replaceDefaultCorePrompt?: string;
  disableServiceSystems: string[];
};

/**
 * System 档位。
 *
 * 关键点（中文）
 * - 由外部创建 systemer 时显式指定，避免在 system 域猜测业务上下文。
 */
export type SystemProfile = "chat" | "task";

/**
 * 按显式 profile 解析 system 上下文档位。
 *
 * 关键点（中文）
 * - chat 模式：使用默认 core prompt 与全部 service system。
 * - task 模式：自动替换 task core prompt，并禁用 chat service system。
 */
export function resolveSystemContextProfile(
  profile?: SystemProfile,
): ResolvedSystemContextProfile {
  if (profile !== "task") {
    return {
      mode: "chat",
      disableServiceSystems: [...DEFAULT_DISABLED_SERVICE_NAMES],
    };
  }
  return {
    mode: "task",
    replaceDefaultCorePrompt: TASK_SYSTEM_PROMPT,
    disableServiceSystems: ["chat"],
  };
}

/**
 * 收集 service 维度的 system 文本。
 *
 * 关键点（中文）
 * - 顺序：main service prompt -> service.system -> memory.system。
 * - 单个加载失败走 fail-open，不阻断主链路。
 */
export async function loadServiceSystemPrompts(input: {
  /**
   * 当前 service runtime。
   */
  runtime: ServiceRuntime;

  /**
   * 当前轮禁用的 service 名称集合。
   */
  disabledServiceNames: string[];
}): Promise<string[]> {
  const out: string[] = [];
  const mainServicePrompt = normalizeSystemText(MAIN_SERVICE_PROMPT);
  if (mainServicePrompt) {
    out.push(mainServicePrompt);
  }

  const disabledServiceNames = new Set(
    input.disabledServiceNames
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );

  for (const service of SERVICES) {
    if (typeof service.system !== "function") continue;
    if (disabledServiceNames.has(service.name)) continue;
    try {
      const text = normalizeSystemText(await service.system(input.runtime));
      if (!text) continue;
      out.push(text);
    } catch {
      // fail-open
    }
  }

  try {
    const memoryText = normalizeSystemText(
      await buildMemorySystemText(input.runtime),
    );
    if (memoryText) out.push(memoryText);
  } catch {
    // fail-open
  }

  return out;
}

/**
 * 统一构建一次 Agent 运行所需的 system messages。
 *
 * 关键点（中文）
 * - runtime/static/service 的组装逻辑统一收敛在 system 域。
 */
export async function buildAgentSystemMessages(input: {
  /**
   * 项目根目录（用于模板变量和运行态上下文）。
   */
  projectRoot: string;

  /**
   * 当前会话 ID。
   */
  contextId: string;

  /**
   * 当前请求 ID。
   */
  requestId: string;

  /**
   * 本轮模式（chat/task）。
   */
  mode?: "chat" | "task";

  /**
   * 可选默认 core prompt 替换文本（task 场景常用）。
   */
  replaceDefaultCorePrompt?: string;

  /**
   * 静态 system 文本集合（profile/soul/user/default）。
   */
  staticSystemPrompts: string[];

  /**
   * service system 文本集合（main service + services + memory）。
   */
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
 * 统一解析一次 Agent 运行所需的 system messages（含上下文档位判定与 service 收集）。
 */
export async function resolveAgentSystemMessages(input: {
  /**
   * 项目根目录。
   */
  projectRoot: string;

  /**
   * 当前会话 ID。
   */
  contextId: string;

  /**
   * 当前请求 ID。
   */
  requestId: string;

  /**
   * 当前 system 档位（默认 chat）。
   */
  profile?: SystemProfile;

  /**
   * 当前静态 system 文本集合。
   */
  staticSystemPrompts: string[];

  /**
   * 当前 service runtime。
   */
  runtime: ServiceRuntime;
}): Promise<SystemModelMessage[]> {
  const profile = resolveSystemContextProfile(input.profile);
  return await buildAgentSystemMessages({
    projectRoot: input.projectRoot,
    contextId: input.contextId,
    requestId: input.requestId,
    mode: profile.mode,
    replaceDefaultCorePrompt: profile.replaceDefaultCorePrompt,
    staticSystemPrompts: input.staticSystemPrompts,
    serviceSystemPrompts: await loadServiceSystemPrompts({
      runtime: input.runtime,
      disabledServiceNames: profile.disableServiceSystems,
    }),
  });
}
