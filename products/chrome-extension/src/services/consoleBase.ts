/**
 * Console 地址工具。
 *
 * 关键点（中文）：
 * - 统一处理 Console 基础地址的构建与校验。
 * - 扩展弹窗 / options / API 访问层全部复用，避免各自维护一套 host/port 规则。
 */

/**
 * Console UI 默认地址。
 */
export const DEFAULT_CONSOLE_BASE_URL = "http://127.0.0.1:5315";

/**
 * 归一化 Base Path。
 */
export function normalizeConsoleBasePath(input: string): string {
  const trimmed = String(input || "").trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

/**
 * 归一化 Console 地址。
 */
export function normalizeConsoleBaseUrl(input: string): string {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  return withProtocol.replace(/\/+$/, "");
}

/**
 * 构建 Console 地址。
 */
export function buildConsoleBaseUrl(params: {
  /**
   * Console 访问协议。
   */
  protocol?: "http" | "https";
  /**
   * Console 主机名或 IP。
   */
  host: string;
  /**
   * Console 端口。
   */
  port: number;
  /**
   * Console 可选基础路径。
   */
  basePath?: string;
}): string {
  const protocol = params.protocol === "https" ? "https" : "http";
  const host = String(params.host || "").trim() || "127.0.0.1";
  const rawPort =
    typeof params.port === "number"
      ? params.port
      : Number.parseInt(String(params.port || "").trim(), 10);
  if (!Number.isFinite(rawPort) || Number.isNaN(rawPort)) {
    throw new Error("端口无效");
  }
  const port = Math.trunc(rawPort);
  if (port < 1 || port > 65535) {
    throw new Error("端口范围应为 1-65535");
  }
  const basePath = normalizeConsoleBasePath(String(params.basePath || ""));
  return normalizeConsoleBaseUrl(`${protocol}://${host}:${port}${basePath}`);
}

/**
 * 解析最终应使用的 Console 地址。
 */
export function resolveConsoleBaseUrl(input?: string): string {
  const normalized = normalizeConsoleBaseUrl(
    String(input || "").trim() || DEFAULT_CONSOLE_BASE_URL,
  );
  if (!normalized) {
    throw new Error("Console 地址配置无效");
  }
  return normalized;
}

/**
 * 解析端口输入框的字符串。
 */
export function parsePortInput(value: string): number | null {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return null;
  if (parsed < 1 || parsed > 65535) return null;
  return Math.trunc(parsed);
}
