/**
 * Dashboard 通用 helper。
 *
 * 关键点（中文）
 * - 聚合 query/path/文本裁剪 等基础工具。
 * - 不依赖任何业务状态。
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * 解析 limit 参数并做边界裁剪。
 */
export function toLimit(
  raw: string | undefined,
  fallback = DEFAULT_LIMIT,
): number {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return fallback;
  return Math.max(1, Math.min(MAX_LIMIT, n));
}

/**
 * 转成可选字符串。
 */
export function toOptionalString(input: unknown): string | undefined {
  const value = typeof input === "string" ? input.trim() : "";
  return value ? value : undefined;
}

/**
 * 安全 decodeURIComponent。
 */
export function decodeMaybe(value: string): string {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

/**
 * 文本截断。
 */
export function truncateText(text: string, maxChars: number): string {
  const normalized = String(text || "");
  if (normalized.length <= maxChars) return normalized;
  return normalized.slice(0, Math.max(0, maxChars - 3)) + "...";
}
