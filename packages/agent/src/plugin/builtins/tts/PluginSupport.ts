/**
 * TTS plugin 输入与 JSON 辅助。
 *
 * 关键点（中文）
 * - 只放 plugin action 映射中的通用 option 读取与 JSON 标准化。
 * - TTS 依赖安装、合成执行等领域逻辑仍留在 dependency/runtime 模块。
 */

import type { JsonObject, JsonValue } from "@/types/common/Json.js";

/**
 * 将普通对象转为可持久化 JSON object。
 */
export function toJsonObject(
  input: Record<string, unknown> | null | undefined,
): JsonObject | null {
  if (!input) return null;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value
        .filter((item) => item !== undefined)
        .map((item) => item as JsonValue);
      continue;
    }
    if (typeof value === "object") {
      out[key] = toJsonObject(value as Record<string, unknown>) || {};
    }
  }
  return out;
}

/**
 * 读取字符串选项。
 */
export function getStringOpt(
  opts: Record<string, JsonValue>,
  key: string,
): string | undefined {
  const value = opts[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * 读取布尔选项。
 */
export function getBooleanOpt(
  opts: Record<string, JsonValue>,
  key: string,
  defaultValue: boolean,
): boolean {
  const value = opts[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return defaultValue;
}

/**
 * 读取数字选项。
 */
export function getNumberOpt(
  opts: Record<string, JsonValue>,
  key: string,
): number | undefined {
  const value = opts[key];
  return typeof value === "number" && Number.isFinite(value) && !Number.isNaN(value)
    ? value
    : undefined;
}
