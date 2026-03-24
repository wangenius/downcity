/**
 * 页内发送脚本通用工具。
 *
 * 关键点（中文）：
 * - 统一提供文本归一化、错误读取、文件名裁剪等基础能力。
 * - 让 UI、路由、页面解析共享一套最小工具层。
 */

/**
 * 归一化文本。
 */
export function normalizeText(input: unknown, maxChars?: number): string {
  const text = String(input || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (!Number.isFinite(maxChars) || Number(maxChars) <= 0) return text;
  return text.slice(0, Math.trunc(Number(maxChars)));
}

/**
 * 裁剪字符串但不做空白归一化。
 */
export function clipText(input: unknown, maxChars?: number): string {
  const text = String(input || "");
  if (!Number.isFinite(maxChars) || Number(maxChars) <= 0) return text;
  return text.length > Number(maxChars)
    ? text.slice(0, Math.trunc(Number(maxChars)))
    : text;
}

/**
 * 读取错误文本。
 */
export function readErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "未知错误");
}

/**
 * 生成安全文件名片段。
 */
export function toSafeFileNamePart(input: string): string {
  const value = String(input || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 36);
  return value || "selection";
}
