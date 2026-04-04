/**
 * Service Schedule 时间解析工具。
 *
 * 关键点（中文）
 * - 统一解析 `--delay` / `--time` 对应的调度时间。
 * - 输出统一毫秒时间戳，供 command 层与持久化层复用。
 */

/**
 * 判断是否为“缺少时区”的 ISO 时间字符串。
 */
function looksLikeIsoDatetimeWithoutTimezone(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  const isoLike = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text);
  if (!isoLike) return false;
  return !/(?:Z|[+-]\d{2}:\d{2})$/i.test(text);
}

/**
 * 解析非负整数。
 */
function parseNonNegativeIntOptionOrThrow(value: string, fieldName: string): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }
  return parsed;
}

/**
 * 解析绝对执行时间。
 *
 * 支持格式（中文）
 * - Unix 时间戳秒/毫秒
 * - ISO 时间字符串（必须显式带时区）
 */
export function parseScheduleTimeOptionOrThrow(
  value: string,
  fieldName: string,
): number {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }

  if (/^\d+$/.test(text)) {
    const parsed = Number.parseInt(text, 10);
    if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid ${fieldName}: ${value}`);
    }
    return parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
  }

  if (looksLikeIsoDatetimeWithoutTimezone(text)) {
    throw new Error(
      `Invalid ${fieldName}: ${value}. ISO datetime must include timezone offset (e.g. +08:00 or Z).`,
    );
  }

  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${fieldName}: ${value}. Use Unix timestamp (seconds/ms) or ISO datetime.`,
    );
  }
  return parsed;
}

/**
 * 解析 command 层调度输入并归一化为绝对毫秒时间戳。
 *
 * 说明（中文）
 * - `delayMs` 与 `time` 只能二选一。
 * - 未传时返回 `undefined`，表示立即执行。
 */
export function parseScheduledRunAtMsOrThrow(params: {
  delay?: string | number | undefined;
  time?: string | number | undefined;
}): number | undefined {
  const delayText =
    params.delay === undefined || params.delay === null
      ? ""
      : String(params.delay).trim();
  const timeText =
    params.time === undefined || params.time === null
      ? ""
      : String(params.time).trim();

  if (delayText && timeText) {
    throw new Error("`--delay` and `--time` cannot be used together.");
  }

  if (delayText) {
    return Date.now() + parseNonNegativeIntOptionOrThrow(delayText, "delay");
  }

  if (timeText) {
    return parseScheduleTimeOptionOrThrow(timeText, "time");
  }

  return undefined;
}

/**
 * 规范化 API/存储层传入的 runAtMs。
 */
export function normalizeRunAtMsOrThrow(
  value: string | number | undefined,
  fieldName: string,
): number {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${fieldName} is required`);
  }
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${fieldName}: ${String(value)}`);
  }
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${String(value)}`);
  }
  return parsed;
}
