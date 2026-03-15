/**
 * Task definition parsing and validation.
 *
 * 关键点（中文）
 * - `task.md` 使用 YAML frontmatter + markdown 正文
 * - frontmatter 必须包含：task_name/cron/description/contextId/status
 * - 正文（body）会作为一次 run 的输入，且每次执行都从“干净历史”开始
 */

import yaml from "js-yaml";
import path from "node:path";
import cron from "node-cron";
import { parseFrontMatter } from "./Frontmatter.js";
import type {
  ShipTaskDefinitionV1,
  ShipTaskFrontmatterV1,
  ShipTaskKind,
  ShipTaskStatus,
} from "@services/task/types/Task.js";
import type { JsonObject, JsonValue } from "@/types/Json.js";

/**
 * 必填 frontmatter 字段清单。
 */
const REQUIRED_FIELDS: Array<keyof ShipTaskFrontmatterV1> = [
  "taskName",
  "cron",
  "description",
  "contextId",
  "status",
];

type TaskRawValue = JsonValue | undefined;

/**
 * cron alias 映射表。
 *
 * 关键点（中文）
 * - 与 scheduler 侧保持一致，避免“写入可过，调度不可用”的分裂行为。
 */
const CRON_ALIAS_TO_EXPRESSION: Record<string, string> = {
  "@manual": "@manual",
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

/**
 * ISO8601 日期时间（必须显式时区）。
 *
 * 示例（中文）
 * - `2026-03-08T10:30:00Z`
 * - `2026-03-08T18:30:00+08:00`
 */
const ISO_DATETIME_WITH_TZ_REGEXP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

/**
 * 把用户输入 cron（含 alias）映射为 node-cron 可执行表达式。
 *
 * 关键点（中文）
 * - 返回 `@manual` 表示“仅手动触发”。
 */
export function normalizeTaskCronExpression(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const lower = value.toLowerCase();
  return CRON_ALIAS_TO_EXPRESSION[lower] || value;
}

/**
 * 校验并归一化 cron。
 *
 * 关键点（中文）
 * - alias 会统一为小写存储，避免大小写抖动。
 * - 非 `@manual` 必须通过 node-cron 校验。
 */
export function normalizeTaskCron(
  input: TaskRawValue,
): { ok: true; value: string } | { ok: false; error: string } {
  const raw = String(input || "").trim();
  if (!raw) return { ok: false, error: "cron cannot be empty" };

  const lower = raw.toLowerCase();
  const canonical = CRON_ALIAS_TO_EXPRESSION[lower] ? lower : raw;
  const expression = normalizeTaskCronExpression(canonical);
  if (!expression) return { ok: false, error: "cron cannot be empty" };
  if (expression !== "@manual" && !cron.validate(expression)) {
    return { ok: false, error: `Invalid cron: "${raw}"` };
  }
  return { ok: true, value: canonical };
}

/**
 * 校验并归一化 timezone。
 *
 * 关键点（中文）
 * - 仅允许 IANA 时区（例如 `Asia/Shanghai`）。
 */
export function normalizeTaskTimezone(
  input: TaskRawValue,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: undefined };
  const raw = String(input || "").trim();
  if (!raw) return { ok: true, value: undefined };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
  } catch {
    return { ok: false, error: `Invalid timezone: "${raw}" (expected IANA timezone)` };
  }
  return { ok: true, value: raw };
}

/**
 * 归一化 task 状态。
 *
 * 关键点（中文）
 * - 输入不合法时返回 `null`，由上层统一产出可读错误。
 */
export function normalizeTaskStatus(input: TaskRawValue): ShipTaskStatus | null {
  const s = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (s === "enabled") return "enabled";
  if (s === "paused") return "paused";
  if (s === "disabled") return "disabled";
  return null;
}

/**
 * 归一化 task 执行类型。
 *
 * 关键点（中文）
 * - 缺省值为 `agent`，保证历史任务兼容
 */
export function normalizeTaskKind(input: TaskRawValue): ShipTaskKind {
  const s = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (s === "script") return "script";
  return "agent";
}

/**
 * 归一化单次计划时间。
 *
 * 关键点（中文）
 * - 输入为空时返回 undefined
 * - 统一序列化为 ISO8601，避免时区歧义
 */
export function normalizeTaskTime(
  input: TaskRawValue,
): { ok: true; value?: string } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: undefined };
  const raw = String(input || "").trim();
  if (!raw) return { ok: true, value: undefined };
  if (!ISO_DATETIME_WITH_TZ_REGEXP.test(raw)) {
    return {
      ok: false,
      error:
        `Invalid time: "${raw}" (expected ISO8601 datetime with timezone, e.g. 2026-03-08T10:30:00+08:00 or Z)`,
    };
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms) || Number.isNaN(ms)) {
    return {
      ok: false,
      error:
        `Invalid time: "${raw}" (expected ISO8601 datetime with timezone, e.g. 2026-03-08T10:30:00+08:00 or Z)`,
    };
  }
  return { ok: true, value: new Date(ms).toISOString() };
}

/**
 * 校验调度组合是否合法。
 *
 * 关键点（中文）
 * - `time` 是一次性触发语义，要求 `cron=@manual`，避免双调度歧义。
 */
export function validateTaskScheduleCombination(params: {
  cron: string;
  time?: string;
}): { ok: true } | { ok: false; error: string } {
  const expression = normalizeTaskCronExpression(params.cron);
  if (!expression) return { ok: false, error: "cron cannot be empty" };
  if (params.time && expression !== "@manual") {
    return {
      ok: false,
      error: "Invalid schedule: `time` requires `cron=@manual`",
    };
  }
  return { ok: true };
}

/**
 * 归一化 requiredArtifacts 配置。
 *
 * 关键点（中文）
 * - 仅允许 run 目录内的相对路径（禁止绝对路径/`.`/`..`）
 * - 输出统一为 posix 风格，便于跨平台审计
 */
export function normalizeRequiredArtifacts(
  input: TaskRawValue,
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, error: "Invalid requiredArtifacts: expected string[]" };
  }

  const out: string[] = [];
  for (const item of input) {
    const raw = String(item ?? "").trim();
    if (!raw) {
      return { ok: false, error: "Invalid requiredArtifacts: path must be non-empty string" };
    }

    const normalized = raw.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized)) {
      return { ok: false, error: `Invalid requiredArtifacts path (must be relative): "${raw}"` };
    }

    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 0) {
      return { ok: false, error: `Invalid requiredArtifacts path: "${raw}"` };
    }
    if (segments.some((seg) => seg === "." || seg === "..")) {
      return { ok: false, error: `Invalid requiredArtifacts path (dot segments not allowed): "${raw}"` };
    }

    out.push(segments.join("/"));
  }

  return { ok: true, value: Array.from(new Set(out)) };
}

/**
 * 归一化 minOutputChars 配置。
 *
 * 关键点（中文）
 * - 允许 number 或数字字符串
 * - 必须为 >= 0 的整数
 */
export function normalizeMinOutputChars(
  input: TaskRawValue,
): { ok: true; value?: number } | { ok: false; error: string } {
  if (input === undefined || input === null || input === "") return { ok: true, value: undefined };

  let raw = Number.NaN;
  if (typeof input === "number") {
    raw = input;
  } else if (typeof input === "string") {
    const s = input.trim();
    if (!/^\d+$/.test(s)) {
      return { ok: false, error: `Invalid minOutputChars: "${String(input)}" (expected integer >= 0)` };
    }
    raw = Number(s);
  }

  if (!Number.isInteger(raw) || Number.isNaN(raw) || raw < 0) {
    return { ok: false, error: `Invalid minOutputChars: "${String(input)}" (expected integer >= 0)` };
  }

  return { ok: true, value: raw };
}

/**
 * 归一化 maxDialogueRounds 配置。
 *
 * 关键点（中文）
 * - 允许 number 或数字字符串
 * - 必须为 >=1 的整数，并限制上限防止过长循环
 */
export function normalizeMaxDialogueRounds(
  input: TaskRawValue,
): { ok: true; value?: number } | { ok: false; error: string } {
  if (input === undefined || input === null || input === "") return { ok: true, value: undefined };

  let raw = Number.NaN;
  if (typeof input === "number") {
    raw = input;
  } else if (typeof input === "string") {
    const s = input.trim();
    if (!/^\d+$/.test(s)) {
      return { ok: false, error: `Invalid maxDialogueRounds: "${String(input)}" (expected integer >= 1)` };
    }
    raw = Number(s);
  }

  if (!Number.isInteger(raw) || Number.isNaN(raw) || raw < 1 || raw > 20) {
    return { ok: false, error: `Invalid maxDialogueRounds: "${String(input)}" (expected integer in [1, 20])` };
  }

  return { ok: true, value: raw };
}

/**
 * 解析 task.md 为结构化定义。
 *
 * 算法（中文）
 * 1) 解析 frontmatter 与 body
 * 2) 校验必填字段与 status 枚举
 * 3) 规范化路径与字符串字段
 */
export function parseTaskMarkdown(params: {
  taskId: string;
  markdown: string;
  taskMdPath: string;
  projectRoot: string;
}): { ok: true; task: ShipTaskDefinitionV1 } | { ok: false; error: string } {
  const { taskId, markdown, taskMdPath, projectRoot } = params;
  const text = String(markdown ?? "");
  const { frontMatterYaml, body } = parseFrontMatter(text);

  if (!frontMatterYaml || !frontMatterYaml.trim()) {
    return { ok: false, error: "Missing YAML frontmatter (--- ... ---) in task.md" };
  }

  let meta: JsonObject | null = null;
  try {
    const loaded = yaml.load(frontMatterYaml) as JsonValue;
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      meta = loaded as JsonObject;
    } else {
      meta = null;
    }
  } catch (e) {
    return { ok: false, error: `Invalid YAML frontmatter: ${String(e)}` };
  }

  if (!meta || typeof meta !== "object") {
    return { ok: false, error: "Invalid frontmatter: must be a YAML object" };
  }

  const missing: string[] = [];
  const rawTaskName = String(meta?.task_name ?? meta?.taskName ?? "").trim();
  if (!rawTaskName) missing.push("task_name");
  for (const f of REQUIRED_FIELDS.filter((x) => x !== "taskName")) {
    if (meta?.[f] === undefined || meta?.[f] === null || String(meta?.[f]).trim() === "") {
      missing.push(String(f));
    }
  }
  if (missing.length > 0) {
    return { ok: false, error: `Missing required frontmatter fields: ${missing.join(", ")}` };
  }

  const status = normalizeTaskStatus(meta.status);
  if (!status) {
    return {
      ok: false,
      error: `Invalid status: "${String(meta.status)}" (expected: enabled|paused|disabled)`,
    };
  }
  const cronNormalized = normalizeTaskCron(meta.cron);
  if (!cronNormalized.ok) {
    return { ok: false, error: cronNormalized.error };
  }
  const kind = normalizeTaskKind(meta.kind);
  const timeNormalized = normalizeTaskTime(meta.time);
  if (!timeNormalized.ok) {
    return { ok: false, error: timeNormalized.error };
  }
  const timezoneNormalized = normalizeTaskTimezone(meta.timezone);
  if (!timezoneNormalized.ok) {
    return { ok: false, error: timezoneNormalized.error };
  }
  const scheduleCombination = validateTaskScheduleCombination({
    cron: cronNormalized.value,
    time: timeNormalized.value,
  });
  if (!scheduleCombination.ok) {
    return { ok: false, error: scheduleCombination.error };
  }
  const bodyText = String(body ?? "").trim();
  if (kind === "script" && !bodyText) {
    return { ok: false, error: "script task body cannot be empty" };
  }

  const requiredArtifactsNormalized = normalizeRequiredArtifacts(meta.requiredArtifacts);
  if (!requiredArtifactsNormalized.ok) {
    return { ok: false, error: requiredArtifactsNormalized.error };
  }

  const minOutputCharsNormalized = normalizeMinOutputChars(meta.minOutputChars);
  if (!minOutputCharsNormalized.ok) {
    return { ok: false, error: minOutputCharsNormalized.error };
  }
  const maxDialogueRoundsNormalized = normalizeMaxDialogueRounds(meta.maxDialogueRounds);
  if (!maxDialogueRoundsNormalized.ok) {
    return { ok: false, error: maxDialogueRoundsNormalized.error };
  }

  const fm: ShipTaskFrontmatterV1 = {
    taskName: rawTaskName,
    cron: cronNormalized.value,
    description: String(meta.description).trim(),
    contextId: String(meta.contextId).trim(),
    kind,
    ...(timeNormalized.value ? { time: timeNormalized.value } : {}),
    status,
    ...(timezoneNormalized.value ? { timezone: timezoneNormalized.value } : {}),
    ...(requiredArtifactsNormalized.value.length > 0
      ? { requiredArtifacts: requiredArtifactsNormalized.value }
      : {}),
    ...(typeof minOutputCharsNormalized.value === "number"
      ? { minOutputChars: minOutputCharsNormalized.value }
      : {}),
    ...(typeof maxDialogueRoundsNormalized.value === "number"
      ? { maxDialogueRounds: maxDialogueRoundsNormalized.value }
      : {}),
  };

  // 关键点（中文）：taskMdPath 仅用于审计/展示，统一保存为 projectRoot 相对路径。
  const relTaskMdPath = path
    .relative(projectRoot, taskMdPath)
    .split(path.sep)
    .join("/");

  const task: ShipTaskDefinitionV1 = {
    v: 1,
    taskId,
    frontmatter: fm,
    body: String(body ?? "").trim(),
    taskMdPath: relTaskMdPath,
  };

  return { ok: true, task };
}

/**
 * 生成 task.md 文本。
 *
 * 关键点（中文）
 * - 输出稳定的 YAML + 正文格式，便于人工编辑与机器解析。
 */
export function buildTaskMarkdown(params: {
  frontmatter: ShipTaskFrontmatterV1;
  body: string;
}): string {
  const { frontmatter, body } = params;
  const cronNormalized = normalizeTaskCron(frontmatter.cron);
  if (!cronNormalized.ok) {
    throw new Error(cronNormalized.error);
  }
  const requiredArtifactsNormalized = normalizeRequiredArtifacts(frontmatter.requiredArtifacts);
  if (!requiredArtifactsNormalized.ok) {
    throw new Error(requiredArtifactsNormalized.error);
  }
  const minOutputCharsNormalized = normalizeMinOutputChars(frontmatter.minOutputChars);
  if (!minOutputCharsNormalized.ok) {
    throw new Error(minOutputCharsNormalized.error);
  }
  const maxDialogueRoundsNormalized = normalizeMaxDialogueRounds(frontmatter.maxDialogueRounds);
  if (!maxDialogueRoundsNormalized.ok) {
    throw new Error(maxDialogueRoundsNormalized.error);
  }

  const kind = normalizeTaskKind(frontmatter.kind);
  const timeNormalized = normalizeTaskTime(frontmatter.time);
  if (!timeNormalized.ok) {
    throw new Error(timeNormalized.error);
  }
  const timezoneNormalized = normalizeTaskTimezone(frontmatter.timezone);
  if (!timezoneNormalized.ok) {
    throw new Error(timezoneNormalized.error);
  }
  const scheduleCombination = validateTaskScheduleCombination({
    cron: cronNormalized.value,
    time: timeNormalized.value,
  });
  if (!scheduleCombination.ok) {
    throw new Error(scheduleCombination.error);
  }
  const bodyText = String(body ?? "").trim();
  if (kind === "script" && !bodyText) {
    throw new Error("script task body cannot be empty");
  }

  const meta = {
    task_name: String(frontmatter.taskName || "").trim(),
    cron: cronNormalized.value,
    description: String(frontmatter.description || "").trim(),
    contextId: String(frontmatter.contextId || "").trim(),
    kind,
    ...(timeNormalized.value ? { time: timeNormalized.value } : {}),
    status: String(frontmatter.status || "").trim(),
    ...(timezoneNormalized.value ? { timezone: timezoneNormalized.value } : {}),
    ...(requiredArtifactsNormalized.value.length > 0
      ? { requiredArtifacts: requiredArtifactsNormalized.value }
      : {}),
    ...(typeof minOutputCharsNormalized.value === "number"
      ? { minOutputChars: minOutputCharsNormalized.value }
      : {}),
    ...(typeof maxDialogueRoundsNormalized.value === "number"
      ? { maxDialogueRounds: maxDialogueRoundsNormalized.value }
      : {}),
  };

  // js-yaml 默认会输出 `null` 等；这里保证必要字段都是 string。
  const yamlText = yaml.dump(meta, {
    lineWidth: 120,
    noRefs: true,
  });

  const bodyWithTrailingLf = bodyText ? bodyText + "\n" : "";
  return `---\n${yamlText}---\n\n${bodyWithTrailingLf}`;
}
