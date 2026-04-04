/**
 * 页内发送脚本通用工具。
 *
 * 关键点（中文）：
 * - 统一提供文本归一化、错误读取、文件名裁剪等基础能力。
 * - content script 必须保持自包含，不能再依赖会触发共享 chunk 的通用 services。
 */

function isAuthErrorMessage(input: unknown): boolean {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("missing bearer token") ||
    normalized.includes("invalid bearer token") ||
    normalized.includes("permission denied") ||
    normalized.includes("401")
  );
}

function decorateAuthErrorText(input: unknown): string {
  const message = String(input || "").trim();
  if (!message) return "未知错误";
  if (isAuthErrorMessage(message)) {
    return `${message}。请在扩展设置页登录 Console 账户。`;
  }
  return message;
}

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
  if (error instanceof Error) return decorateAuthErrorText(error.message);
  return decorateAuthErrorText(error || "未知错误");
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
